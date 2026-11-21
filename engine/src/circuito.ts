/**
 * Cómo se describe un circuito para el motor.
 *
 * Un circuito es una lista de elementos. Cada elemento se conecta a nodos,
 * que se identifican con un nombre de texto. El nodo "0" es la tierra
 * (referencia de 0 V); también se acepta "gnd" en cualquier combinación de
 * mayúsculas y minúsculas.
 *
 * Convención de signos (la misma de SPICE):
 * - La corriente de un elemento es la que entra por su primer terminal,
 *   lo atraviesa y sale por el segundo.
 * - La potencia es voltaje × corriente con esa convención. Si es positiva,
 *   el elemento absorbe energía; si es negativa, la entrega (como una fuente
 *   que alimenta el circuito).
 */

export type Nodo = string;

export const TIERRA: Nodo = '0';

/** Convierte "gnd"/"GND" en "0"; el resto de nombres no cambia. */
export function normalizarNodo(nodo: Nodo): Nodo {
  const limpio = nodo.trim();
  return limpio.toLowerCase() === 'gnd' ? TIERRA : limpio;
}

interface ElementoBase {
  /** Nombre único dentro del circuito, por ejemplo "R1". */
  nombre: string;
}

export interface Resistencia extends ElementoBase {
  tipo: 'resistencia';
  a: Nodo;
  b: Nodo;
  resistencia_ohm: number;
}

/** Fuente de voltaje DC ideal: V(positivo) − V(negativo) = voltaje_v. */
export interface FuenteVoltaje extends ElementoBase {
  tipo: 'fuenteVoltaje';
  positivo: Nodo;
  negativo: Nodo;
  voltaje_v: number;
}

/** Fuente de corriente DC ideal: corriente_a circula por dentro de la fuente, de `desde` hacia `hacia`. */
export interface FuenteCorriente extends ElementoBase {
  tipo: 'fuenteCorriente';
  desde: Nodo;
  hacia: Nodo;
  corriente_a: number;
}

/**
 * Fuente de voltaje controlada por voltaje (VCVS, "E" en SPICE):
 * V(positivo) − V(negativo) = ganancia · (V(controlPositivo) − V(controlNegativo)).
 * Por los terminales de control no circula corriente.
 */
export interface FuenteVoltajeControlada extends ElementoBase {
  tipo: 'vcvs';
  positivo: Nodo;
  negativo: Nodo;
  controlPositivo: Nodo;
  controlNegativo: Nodo;
  ganancia: number;
}

/**
 * Fuente de corriente controlada por voltaje (VCCS, "G" en SPICE):
 * circula transconductancia_s · (V(controlPositivo) − V(controlNegativo))
 * por dentro de la fuente, de `desde` hacia `hacia`.
 */
export interface FuenteCorrienteControlada extends ElementoBase {
  tipo: 'vccs';
  desde: Nodo;
  hacia: Nodo;
  controlPositivo: Nodo;
  controlNegativo: Nodo;
  transconductancia_s: number;
}

/** En DC, una bobina ideal es un cortocircuito (0 V entre sus terminales). */
export interface Bobina extends ElementoBase {
  tipo: 'bobina';
  a: Nodo;
  b: Nodo;
  inductancia_h: number;
}

/** En DC, un condensador ideal es un circuito abierto (no pasa corriente). */
export interface Condensador extends ElementoBase {
  tipo: 'condensador';
  a: Nodo;
  b: Nodo;
  capacitancia_f: number;
}

/**
 * Diodo de unión PN (modelo de Shockley):
 *   I = Is · (e^(V / (n·Vt)) − 1),   con V = V(anodo) − V(catodo) y Vt ≈ 25.85 mV a 27 °C.
 *
 * Si se da `ruptura_v`, conduce también en inversa al acercarse a −ruptura_v
 * (diodo zener): en V = −ruptura_v circula `corrienteRuptura_a` de cátodo a ánodo.
 */
export interface Diodo extends ElementoBase {
  tipo: 'diodo';
  anodo: Nodo;
  catodo: Nodo;
  /** Is, corriente de saturación. Por defecto 1e-14 A. */
  corrienteSaturacion_a?: number;
  /** n, coeficiente de emisión (entre 1 y 2 en diodos reales). Por defecto 1. */
  coeficienteEmision?: number;
  /** Voltaje de ruptura inversa (zener), positivo. Sin él, el diodo no rompe. */
  ruptura_v?: number;
  /** Corriente inversa en el voltaje de ruptura. Por defecto 1 mA. */
  corrienteRuptura_a?: number;
}

/**
 * Limitador suave: una fuente de voltaje controlada que copia
 * ganancia · (V(controlPositivo) − V(controlNegativo)) mientras está lejos de
 * los topes, y se curva suavemente hasta quedarse en `minimo_v` o `maximo_v`.
 * Con ganancia grande es un op-amp que satura.
 */
export interface Limitador extends ElementoBase {
  tipo: 'limitador';
  positivo: Nodo;
  negativo: Nodo;
  controlPositivo: Nodo;
  controlNegativo: Nodo;
  ganancia: number;
  minimo_v: number;
  maximo_v: number;
  /** Qué tan redondeada es la esquina, en voltios. Por defecto 1 % de (máximo − mínimo). */
  suavidad_v?: number;
}

export type Elemento =
  | Resistencia
  | FuenteVoltaje
  | FuenteCorriente
  | FuenteVoltajeControlada
  | FuenteCorrienteControlada
  | Bobina
  | Condensador
  | Diodo
  | Limitador;

export type TipoElemento = Elemento['tipo'];

export interface Circuito {
  elementos: Elemento[];
}
