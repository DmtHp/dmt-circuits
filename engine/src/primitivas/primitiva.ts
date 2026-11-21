import type { Elemento, Nodo } from '../circuito';

/**
 * Cómo se comporta un elemento frente a la conexión entre nodos:
 * - 'conduce': deja pasar corriente según su voltaje (resistencia, diodo).
 * - 'fijaVoltaje': impone un voltaje entre sus terminales (fuente de voltaje, VCVS, bobina en DC).
 * - 'abierto': no ofrece camino para la corriente (fuente de corriente, VCCS, condensador en DC).
 *
 * El motor lo usa para detectar nodos flotantes y bucles de fuentes de voltaje
 * antes de resolver, y así dar un mensaje claro en vez de números sin sentido.
 */
export type ConexionDC = 'conduce' | 'fijaVoltaje' | 'abierto';

/** 'dc': punto de operación (condensador abierto, bobina en corto). 'transitorio': un paso en el tiempo. */
export type Modo = 'dc' | 'transitorio';

export type MetodoIntegracion = 'euler' | 'trapezoidal';

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

/** Información del análisis en curso que reciben las primitivas. */
export interface Contexto {
  readonly modo: Modo;
  /** Tiempo del punto que se está calculando (0 en el punto de operación). */
  readonly tiempo_s: number;
  /** Paso de tiempo h (0 en DC). */
  readonly paso_s: number;
  readonly metodo: MetodoIntegracion;
  /** Entre 0 y 1: escala las fuentes independientes (plan B "encendido gradual de fuentes"). */
  readonly factorFuentes: number;
  /** Conductancia mínima en paralelo con cada unión no lineal, en siemens. */
  readonly gmin_s: number;
  /**
   * Voltaje de un nodo. Al estampar es el de la iteración anterior de
   * Newton-Raphson; al medir es el de la solución final.
   */
  voltaje(nodo: Nodo): number;
  /** Valor de una incógnita extra (por su índice), con el mismo criterio que `voltaje`. */
  valorExtra(indice: number): number;
  /** Una primitiva no lineal avisa que recortó su voltaje: esta iteración todavía no converge. */
  avisarLimitado(): void;
}

export interface Medida {
  voltaje_v: number;
  corriente_a: number;
}

/**
 * Lo que el motor necesita saber de cada tipo de elemento.
 * S es el estado que el elemento guarda entre iteraciones o pasos de tiempo
 * (por ejemplo, el voltaje anterior de un condensador).
 */
export interface Primitiva<E extends Elemento, S = undefined> {
  readonly conexionDC: ConexionDC;
  /** Conexión durante un paso de tiempo; si falta, se usa conexionDC. */
  readonly conexionTransitorio?: ConexionDC;
  /** 1 si el elemento agrega su corriente como incógnita extra (MNA), 0 si no. */
  readonly variablesExtra: 0 | 1;
  /** true si su ecuación no es lineal: el motor tendrá que iterar con Newton-Raphson. */
  readonly noLineal?: boolean;
  /** Los dos terminales por donde circula la corriente del elemento. */
  terminales(e: E): readonly [Nodo, Nodo];
  /** Terminales que solo "miden" voltaje (fuentes controladas); por ellos no circula corriente. */
  terminalesControl(e: E): readonly Nodo[];
  /** Lista de problemas con los valores; vacía si todo está bien. */
  validar(e: E): string[];
  crearEstado?(e: E): S;
  /** `extra` es la fila/columna de la incógnita extra, o -1 si no tiene. */
  estampar(e: E, est: Estampador, ctx: Contexto, extra: number, estado: S): void;
  /** Corriente que entra por el primer terminal y sale por el segundo. */
  corriente(e: E, ctx: Contexto, extra: number, estado: S): number;
  /** Al empezar un transitorio, a partir del punto de operación (o de sus condiciones iniciales). */
  iniciarTransitorio?(e: E, estado: S, medida: Medida, usarCondicionesIniciales: boolean): void;
  /** Tras aceptar un paso de tiempo: guardar lo necesario para el siguiente. */
  aceptarPaso?(e: E, estado: S, medida: Medida): void;
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

/** Como exigirPositivo, pero el valor puede faltar. */
export function exigirPositivoOpcional(valor: number | undefined, campo: string, unidad: string): string[] {
  return valor === undefined ? [] : exigirPositivo(valor, campo, unidad);
}
