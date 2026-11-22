/**
 * Del componente JSON a elementos del motor.
 *
 * Cada bloque usa una plantilla de su categoría; cada línea de "netlist" se lee
 * con el lector de netlists del motor. Los nombres de pines se reemplazan por
 * los nodos del circuito donde está conectado el componente, y todo lo
 * interno recibe un prefijo con el nombre de la instancia (por ejemplo
 * "U1.u2.x") para que dos LM358 en el mismo circuito no choquen.
 */

import { leerNetlist, TIERRA, type Elemento } from '../../engine/src';
import { obtenerCategoria } from './categorias';
import { valorDe } from './expresiones';
import type { Componente, ModeloSubcircuito } from './formato';

/** Resistencia que se pone a tierra en cada pin sin conectar, para que no quede flotando. */
export const RESISTENCIA_PIN_LIBRE_OHM = 1e9;

export interface Instancia {
  elementos: Elemento[];
  /** Pines que no estaban conectados (quedaron a tierra a través de 1 GΩ). */
  pinesSinConectar: string[];
}

/** Campos de un elemento del motor que contienen nodos. */
const CAMPOS_NODO = [
  'a',
  'b',
  'positivo',
  'negativo',
  'desde',
  'hacia',
  'controlPositivo',
  'controlNegativo',
  'anodo',
  'catodo',
  'referenciaMaxima',
  'referenciaMinima',
] as const;

/** Copia un elemento cambiando su nombre y sus nodos. */
export function renombrar(elemento: Elemento, nombre: string, nodo: (n: string) => string): Elemento {
  const copia: Record<string, unknown> = { ...elemento, nombre };
  for (const campo of CAMPOS_NODO) {
    const valor = copia[campo];
    if (typeof valor === 'string') copia[campo] = nodo(valor);
  }
  return copia as unknown as Elemento;
}

/**
 * Arma el componente.
 * @param instancia Nombre de la instancia en el circuito, por ejemplo "U1".
 * @param conexiones Nodo del circuito de cada pin, por nombre de pin o por número ("1", "2"…).
 * @param parametros Valores que reemplazan a los del archivo (por ejemplo el valor de una resistencia).
 */
export function construir(
  componente: Componente,
  instancia: string,
  conexiones: Readonly<Record<string, string>>,
  parametros: Readonly<Record<string, number>> = {},
): Instancia {
  if (componente.modelo.tipo !== 'subcircuito') {
    throw new Error(`${componente.nombre} es un componente lógico: su simulación llega con la etapa digital.`);
  }
  const modelo: ModeloSubcircuito = componente.modelo;
  const elementos: Elemento[] = [];
  const pinesSinConectar: string[] = [];

  // Nodo de cada pin.
  const nodoDePin = new Map<string, string>();
  for (const pin of componente.pines) {
    const conectado = conexiones[pin.nombre] ?? conexiones[String(pin.n)];
    if (conectado !== undefined) {
      nodoDePin.set(pin.nombre, conectado);
    } else {
      const libre = `${instancia}.${pin.nombre}`;
      nodoDePin.set(pin.nombre, libre);
      pinesSinConectar.push(pin.nombre);
      elementos.push({ tipo: 'resistencia', nombre: `${instancia}.libre.${pin.nombre}`, a: libre, b: TIERRA, resistencia_ohm: RESISTENCIA_PIN_LIBRE_OHM });
    }
  }

  const definicion = obtenerCategoria(componente.categoria);
  (modelo.bloques ?? []).forEach((bloque, k) => {
    const plantilla = definicion.plantillas[bloque.usa];
    if (!plantilla) throw new Error(`La plantilla "${bloque.usa}" no existe en la categoría ${definicion.nombre}.`);
    const valores: Record<string, number> = {};
    for (const [nombre, def] of Object.entries(plantilla.parametros)) {
      const crudo = parametros[nombre] ?? bloque.parametros?.[nombre];
      const valor = crudo !== undefined ? valorDe(crudo) : def.defecto;
      if (valor !== undefined) valores[nombre] = valor;
    }
    const nodos = bloque.pines.map((pin) => {
      const nodo = nodoDePin.get(pin);
      if (nodo === undefined) throw new Error(`El bloque ${k + 1} usa el pin "${pin}", que no existe.`);
      return nodo;
    });
    elementos.push(...plantilla.construir(`${instancia}.u${k + 1}.`, nodos, valores));
  });

  if (modelo.netlist && modelo.netlist.length > 0) {
    const interno = leerNetlist(modelo.netlist.join('\n'));
    // Primero los pines (un pin puede llamarse "GND"); después la tierra del circuito; el resto es interno.
    const nodo = (n: string): string => {
      const pin = nodoDePin.get(n);
      if (pin !== undefined) return pin;
      if (n === TIERRA || n.toLowerCase() === 'gnd') return TIERRA;
      return `${instancia}.${n}`;
    };
    for (const e of interno.elementos) elementos.push(renombrar(e, `${instancia}.${e.nombre}`, nodo));
  }

  return { elementos, pinesSinConectar };
}
