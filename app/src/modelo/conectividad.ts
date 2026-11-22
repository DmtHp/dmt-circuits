/**
 * Del dibujo al circuito: qué pines quedan unidos y qué elementos del motor
 * representa cada pieza.
 *
 * Reglas de conexión (como en la mayoría de editores de esquemas):
 * - los dos extremos de un cable están unidos;
 * - todo lo que cae en el mismo punto de la rejilla está unido (pines y extremos de cable);
 * - un extremo de cable que cae en medio de otro cable se une a él (unión en T);
 * - un cable que solo pasa por encima de un pin NO lo conecta: hay que terminar el cable en el pin.
 * Cada grupo unido es un nodo. El grupo que toca una tierra es el nodo "0".
 */

import { construir, type Componente } from '../../../components/src';
import type { Elemento, Nodo } from '../../../engine/src';
import type { Cable, Documento, Pieza, Punto } from './documento';
import { huellaDe, pinesEnLienzo } from './geometria';

/** Resistencia interna del voltímetro: como un multímetro digital típico. */
export const R_VOLTIMETRO_OHM = 10e6;
/** Resistencia interna del amperímetro (shunt), como un multímetro en la escala de mA. */
export const R_AMPERIMETRO_OHM = 0.1;
/** Impedancia de entrada del osciloscopio. */
export const R_OSCILOSCOPIO_OHM = 1e6;

export interface CircuitoArmado {
  elementos: Elemento[];
  /** Nodo de cada pin: clave "idPieza:nombrePin". */
  nodoDePin: Map<string, Nodo>;
  /** Elemento del motor cuya medida representa a la pieza (para lecturas y avisos). */
  elementoPrincipal: Map<string, string>;
  /** Pines que no tocan nada. */
  pinesLibres: { pieza: string; pin: string }[];
  /** Piezas que no se pudieron armar (por ejemplo, una compuerta lógica). */
  problemas: { pieza: string; mensaje: string }[];
}

const clave = (p: Punto): string => `${p.x},${p.y}`;

/** ¿El punto p está sobre el tramo c, sin ser uno de sus extremos? (tramos horizontales, verticales o diagonales). */
function enMedio(p: Punto, c: Cable): boolean {
  const { a, b } = c;
  const cruz = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (cruz !== 0) return false;
  const punto = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  const largo = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return punto > 0 && punto < largo;
}

export function armarCircuito(doc: Documento, biblioteca: ReadonlyMap<string, Componente>): CircuitoArmado {
  // Unión-búsqueda sobre puntos de la rejilla.
  const padre = new Map<string, string>();
  const raiz = (k: string): string => {
    if (!padre.has(k)) padre.set(k, k);
    let r = k;
    while (padre.get(r) !== r) r = padre.get(r)!;
    padre.set(k, r);
    return r;
  };
  const unir = (a: string, b: string): void => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre.set(ra, rb);
  };
  /** Cuántas cosas (pines o extremos de cable) caen en cada punto. */
  const usos = new Map<string, number>();
  const usar = (k: string): void => {
    usos.set(k, (usos.get(k) ?? 0) + 1);
  };

  for (const c of doc.cables) {
    unir(clave(c.a), clave(c.b));
    usar(clave(c.a));
    usar(clave(c.b));
  }
  for (const c of doc.cables) {
    for (const extremo of [c.a, c.b]) {
      for (const otro of doc.cables) {
        if (otro !== c && enMedio(extremo, otro)) {
          unir(clave(extremo), clave(otro.a));
          usar(clave(extremo));
        }
      }
    }
  }

  const pinesPorPieza = new Map<string, { nombre: string; k: string }[]>();
  for (const pieza of doc.piezas) {
    const componente = pieza.componenteId ? biblioteca.get(pieza.componenteId) : undefined;
    const pines = pinesEnLienzo(pieza, huellaDe(pieza, componente)).map((p) => ({ nombre: p.nombre, k: clave({ x: p.X, y: p.Y }) }));
    for (const p of pines) {
      raiz(p.k);
      usar(p.k);
    }
    pinesPorPieza.set(pieza.id, pines);
  }

  // Grupos que tocan una tierra → "0".
  const raicesTierra = new Set<string>();
  for (const pieza of doc.piezas) {
    if (pieza.tipo === 'tierra') for (const p of pinesPorPieza.get(pieza.id)!) raicesTierra.add(raiz(p.k));
  }

  // Nombres de nodos estables: N1, N2… en el orden en que aparecen las piezas.
  const nombreDeRaiz = new Map<string, Nodo>();
  const nodoDe = (k: string): Nodo => {
    const r = raiz(k);
    if (raicesTierra.has(r)) return '0';
    let nombre = nombreDeRaiz.get(r);
    if (!nombre) {
      nombre = `N${nombreDeRaiz.size + 1}`;
      nombreDeRaiz.set(r, nombre);
    }
    return nombre;
  };

  const resultado: CircuitoArmado = { elementos: [], nodoDePin: new Map(), elementoPrincipal: new Map(), pinesLibres: [], problemas: [] };
  for (const pieza of doc.piezas) {
    const pines = pinesPorPieza.get(pieza.id)!;
    const conexiones: Record<string, Nodo> = {};
    for (const p of pines) {
      // Un pin que no toca nada más queda libre (el motor lo pone a tierra con 1 GΩ).
      const libre = (usos.get(p.k) ?? 0) <= 1 && pieza.tipo !== 'tierra';
      const nodo = nodoDe(p.k);
      resultado.nodoDePin.set(`${pieza.id}:${p.nombre}`, nodo);
      if (libre) resultado.pinesLibres.push({ pieza: pieza.id, pin: p.nombre });
      else conexiones[p.nombre] = nodo;
    }
    try {
      agregarElementos(pieza, conexiones, biblioteca, resultado);
    } catch (error) {
      resultado.problemas.push({ pieza: pieza.id, mensaje: error instanceof Error ? error.message : String(error) });
    }
  }
  return resultado;
}

function agregarElementos(
  pieza: Pieza,
  conexiones: Record<string, Nodo>,
  biblioteca: ReadonlyMap<string, Componente>,
  r: CircuitoArmado,
): void {
  const nodo = (nombre: string): Nodo => r.nodoDePin.get(`${pieza.id}:${nombre}`)!;
  const p = pieza.parametros;
  switch (pieza.tipo) {
    case 'tierra':
      return;
    case 'fuente_dc':
      r.elementos.push({ tipo: 'fuenteVoltaje', nombre: pieza.nombre, positivo: nodo('+'), negativo: nodo('-'), voltaje_v: p.voltaje_v ?? 0 });
      r.elementoPrincipal.set(pieza.id, pieza.nombre);
      return;
    case 'fuente_senal': {
      const amplitud = p.amplitud_v ?? 1;
      const desplazamiento = p.desplazamiento_v ?? 0;
      const frecuencia = p.frecuencia_hz ?? 1000;
      const periodo = 1 / frecuencia;
      const bordes = periodo / 1000;
      r.elementos.push({
        tipo: 'fuenteVoltaje',
        nombre: pieza.nombre,
        positivo: nodo('+'),
        negativo: nodo('-'),
        voltaje_v: desplazamiento,
        forma:
          (p.forma ?? 0) === 0
            ? { tipo: 'seno', desplazamiento, amplitud, frecuencia_hz: frecuencia }
            : {
                tipo: 'pulso',
                inicial: desplazamiento - amplitud,
                pulsado: desplazamiento + amplitud,
                retardo_s: 0,
                subida_s: bordes,
                bajada_s: bordes,
                ancho_s: periodo / 2 - bordes,
                periodo_s: periodo,
              },
      });
      r.elementoPrincipal.set(pieza.id, pieza.nombre);
      return;
    }
    case 'voltimetro':
    case 'amperimetro':
      r.elementos.push({
        tipo: 'resistencia',
        nombre: pieza.nombre,
        a: nodo('+'),
        b: nodo('-'),
        resistencia_ohm: pieza.tipo === 'voltimetro' ? R_VOLTIMETRO_OHM : R_AMPERIMETRO_OHM,
      });
      r.elementoPrincipal.set(pieza.id, pieza.nombre);
      return;
    case 'sonda':
      r.elementos.push({ tipo: 'resistencia', nombre: pieza.nombre, a: nodo('p'), b: '0', resistencia_ohm: R_OSCILOSCOPIO_OHM });
      return;
    case 'componente': {
      const componente = pieza.componenteId ? biblioteca.get(pieza.componenteId) : undefined;
      if (!componente) throw new Error(`No encuentro el componente "${pieza.componenteId}" en la biblioteca.`);
      const armado = construir(componente, pieza.nombre, conexiones, pieza.parametros);
      r.elementos.push(...armado.elementos);
      // El elemento que representa al componente: el primero de su primer bloque (R, C, L, D, S…).
      const principal = armado.elementos.find((e) => e.nombre.startsWith(`${pieza.nombre}.u1.`) && !e.nombre.endsWith('RS'));
      if (principal && componente.pines.length === 2) r.elementoPrincipal.set(pieza.id, principal.nombre);
      return;
    }
  }
}
