import type { Elemento, Nodo } from '../circuito';

/**
 * Cómo se comporta un elemento en DC frente a la conexión entre nodos:
 * - 'conduce': deja pasar corriente según la ley de Ohm (resistencia).
 * - 'fijaVoltaje': impone un voltaje entre sus terminales (fuente de voltaje, VCVS, bobina en DC).
 * - 'abierto': no ofrece camino para la corriente continua (fuente de corriente, VCCS, condensador en DC).
 *
 * El motor lo usa para detectar nodos flotantes y bucles de fuentes de voltaje
 * antes de resolver, y así dar un mensaje claro en vez de números sin sentido.
 */
export type ConexionDC = 'conduce' | 'fijaVoltaje' | 'abierto';

/**
 * Lo que un elemento necesita para "estampar" sus ecuaciones en A · x = z.
 * Las filas y columnas de tierra valen -1, y lo que se suma ahí se ignora
 * (el voltaje de tierra es 0 y conocido, así que no es incógnita).
 */
export interface Estampador {
  indiceNodo(nodo: Nodo): number;
  sumarA(fila: number, columna: number, valor: number): void;
  sumarZ(fila: number, valor: number): void;
}

export interface Primitiva<E extends Elemento> {
  readonly conexionDC: ConexionDC;
  /** 1 si el elemento agrega su corriente como incógnita extra (MNA), 0 si no. */
  readonly variablesExtra: 0 | 1;
  /** Los dos terminales por donde circula la corriente del elemento. */
  terminales(e: E): readonly [Nodo, Nodo];
  /** Terminales que solo "miden" voltaje (fuentes controladas); por ellos no circula corriente. */
  terminalesControl(e: E): readonly Nodo[];
  /** Lista de problemas con los valores; vacía si todo está bien. */
  validar(e: E): string[];
  /** `extra` es la fila/columna de la incógnita extra, o -1 si no tiene. */
  estampar(e: E, est: Estampador, extra: number): void;
  /**
   * Corriente que entra por el primer terminal y sale por el segundo.
   * `valorExtra` es el valor resuelto de la incógnita extra (NaN si no tiene).
   */
  corriente(e: E, voltaje: (nodo: Nodo) => number, valorExtra: number): number;
}

/** Comprueba que un valor sea un número finito (no NaN ni infinito). */
export function exigirFinito(valor: number, campo: string): string[] {
  return Number.isFinite(valor) ? [] : [`${campo} debe ser un número finito (recibí ${valor}).`];
}

/** Comprueba que un valor sea finito y mayor que cero. */
export function exigirPositivo(valor: number, campo: string, unidad: string): string[] {
  return Number.isFinite(valor) && valor > 0
    ? []
    : [`${campo} debe ser mayor que 0 ${unidad} (recibí ${valor} ${unidad}).`];
}
