/**
 * Avisos de la vida real: lo que en la protoboard se quemaría o fallaría.
 * Se calculan con las últimas lecturas de la simulación y los límites que
 * trae cada componente (potencia, voltaje, corriente máxima).
 */

import { valorDe, type Componente } from '../../../components/src';
import type { CircuitoArmado } from './conectividad';
import type { Documento, Pieza } from './documento';

export interface Aviso {
  pieza: string;
  nivel: 'peligro' | 'atencion';
  mensaje: string;
}

export interface Lecturas {
  voltajes: ReadonlyMap<string, number>;
  /** Por elemento del motor: voltaje, corriente y potencia. */
  elementos: ReadonlyMap<string, { voltaje_v: number; corriente_a: number; potencia_w: number }>;
}

/** Formato corto con prefijo: 0.045 → "45 m". */
export function conPrefijo(valor: number, unidad: string, cifras = 3): string {
  if (!Number.isFinite(valor)) return '—';
  if (valor === 0) return `0 ${unidad}`;
  const prefijos: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  const redondeado = Number(valor.toPrecision(cifras));
  // Por debajo de 1 pico es ruido numérico (fugas de 1 GΩ, conductancias mínimas): se muestra 0.
  if (Math.abs(redondeado) < 1e-12) return `0 ${unidad}`;
  const [factor, prefijo] = prefijos.find(([f]) => Math.abs(redondeado) >= f) ?? prefijos[prefijos.length - 1]!;
  return `${Number((redondeado / factor).toPrecision(cifras))} ${prefijo}${unidad}`;
}

/** Parámetro de la pieza o, si no lo cambió, el del primer bloque del componente. */
function parametro(pieza: Pieza, componente: Componente, nombre: string): number | undefined {
  if (pieza.parametros[nombre] !== undefined) return pieza.parametros[nombre];
  if (componente.modelo.tipo !== 'subcircuito') return undefined;
  const crudo = componente.modelo.bloques?.[0]?.parametros?.[nombre];
  return crudo === undefined ? undefined : valorDe(crudo);
}

export function calcularAvisos(
  doc: Documento,
  armado: CircuitoArmado,
  lecturas: Lecturas,
  biblioteca: ReadonlyMap<string, Componente>,
): Aviso[] {
  const avisos: Aviso[] = [];
  for (const pieza of doc.piezas) {
    if (pieza.tipo !== 'componente' || !pieza.componenteId) continue;
    const componente = biblioteca.get(pieza.componenteId);
    if (!componente || componente.modelo.tipo !== 'subcircuito') continue;
    const plantilla = componente.modelo.bloques?.[0]?.usa;
    const principal = armado.elementoPrincipal.get(pieza.id);
    const medida = principal ? lecturas.elementos.get(principal) : undefined;

    if (plantilla === 'resistencia' && medida) {
      const maxima = parametro(pieza, componente, 'potencia_w');
      const p = Math.abs(medida.potencia_w);
      if (maxima !== undefined && p > maxima) {
        avisos.push({
          pieza: pieza.id,
          nivel: 'peligro',
          mensaje: `${pieza.nombre} disipa ${conPrefijo(p, 'W')} y es de ${conPrefijo(maxima, 'W')}: en la protoboard se calentaría hasta quemarse.`,
        });
      } else if (maxima !== undefined && p > 0.7 * maxima) {
        avisos.push({ pieza: pieza.id, nivel: 'atencion', mensaje: `${pieza.nombre} trabaja al ${Math.round((100 * p) / maxima)} % de su potencia: se va a calentar.` });
      }
    }

    if (plantilla === 'condensador' && medida) {
      const maximo = parametro(pieza, componente, 'voltaje_maximo_v');
      const v = Math.abs(medida.voltaje_v);
      if (maximo !== undefined && v > maximo) {
        avisos.push({ pieza: pieza.id, nivel: 'peligro', mensaje: `${pieza.nombre} tiene ${conPrefijo(v, 'V')} y aguanta ${conPrefijo(maximo, 'V')}: se dañaría.` });
      }
    }

    if (plantilla === 'bobina' && medida) {
      const maxima = parametro(pieza, componente, 'corriente_maxima_a');
      const i = Math.abs(medida.corriente_a);
      if (maxima !== undefined && i > maxima) {
        avisos.push({ pieza: pieza.id, nivel: 'peligro', mensaje: `Por ${pieza.nombre} pasan ${conPrefijo(i, 'A')} y aguanta ${conPrefijo(maxima, 'A')}.` });
      }
    }

    if (plantilla === 'diodo_basico' && medida) {
      const maxima = parametro(pieza, componente, 'corriente_maxima_a');
      const i = Math.abs(medida.corriente_a);
      const esLed = componente.encapsulado.toUpperCase().startsWith('LED');
      if (maxima !== undefined && i > maxima) {
        avisos.push({
          pieza: pieza.id,
          nivel: 'peligro',
          mensaje: `${esLed ? 'El LED' : 'El diodo'} ${pieza.nombre} recibe ${conPrefijo(i, 'A')} y aguanta ${conPrefijo(maxima, 'A')}: en la protoboard se quemaría. ${esLed ? 'Agrega o aumenta su resistencia en serie.' : ''}`.trim(),
        });
      }
    }

    if (plantilla === 'opamp_basico') {
      const maxima = parametro(pieza, componente, 'alimentacion_maxima_v');
      const bloque = componente.modelo.bloques![0]!;
      const vMas = lecturas.voltajes.get(armado.nodoDePin.get(`${pieza.id}:${bloque.pines[3]}`) ?? '');
      const vMenos = lecturas.voltajes.get(armado.nodoDePin.get(`${pieza.id}:${bloque.pines[4]}`) ?? '');
      if (maxima !== undefined && vMas !== undefined && vMenos !== undefined && vMas - vMenos > maxima) {
        avisos.push({
          pieza: pieza.id,
          nivel: 'peligro',
          mensaje: `${pieza.nombre} está alimentado con ${conPrefijo(vMas - vMenos, 'V')} y el máximo es ${conPrefijo(maxima, 'V')}.`,
        });
      }
      if (vMas !== undefined && vMenos !== undefined && vMas - vMenos <= 0) {
        avisos.push({ pieza: pieza.id, nivel: 'atencion', mensaje: `${pieza.nombre} no tiene alimentación: revisa sus pines de V+ y V−.` });
      }
    }
  }
  const conLibre = new Set<string>();
  for (const libre of armado.pinesLibres) {
    const pieza = doc.piezas.find((p) => p.id === libre.pieza);
    if (pieza && pieza.tipo !== 'componente' && !conLibre.has(pieza.id)) {
      conLibre.add(pieza.id);
      avisos.push({ pieza: pieza.id, nivel: 'atencion', mensaje: `${pieza.nombre} tiene un terminal sin conectar.` });
    }
  }
  return avisos;
}
