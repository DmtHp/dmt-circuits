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

/**
 * Seno (SIN en SPICE). Valor en voltios o amperios según la fuente:
 *   t < retardo:  desplazamiento + amplitud · sen(fase)
 *   t ≥ retardo:  desplazamiento + amplitud · e^(−amortiguamiento·(t − retardo)) · sen(2π·f·(t − retardo) + fase)
 */
export interface FormaSeno {
  tipo: 'seno';
  desplazamiento: number;
  amplitud: number;
  frecuencia_hz: number;
  retardo_s?: number;
  /** θ en 1/s: hace que la amplitud decaiga. 0 si no se indica. */
  amortiguamiento_1_s?: number;
  fase_grados?: number;
}

/**
 * Pulso periódico (PULSE en SPICE): parte en `inicial`, tras `retardo_s` sube
 * en `subida_s` hasta `pulsado`, se queda `ancho_s`, baja en `bajada_s` y repite
 * cada `periodo_s`. Una onda cuadrada es un pulso con subida y bajada cortas.
 */
export interface FormaPulso {
  tipo: 'pulso';
  inicial: number;
  pulsado: number;
  retardo_s: number;
  subida_s: number;
  bajada_s: number;
  ancho_s: number;
  periodo_s: number;
}

export type FormaDeOnda = FormaSeno | FormaPulso;

/**
 * Fuente de voltaje ideal: V(positivo) − V(negativo) = voltaje_v.
 * Si tiene `forma`, en el análisis transitorio manda la forma de onda
 * (también en el punto de partida, t = 0); el análisis DC usa voltaje_v.
 */
export interface FuenteVoltaje extends ElementoBase {
  tipo: 'fuenteVoltaje';
  positivo: Nodo;
  negativo: Nodo;
  voltaje_v: number;
  forma?: FormaDeOnda;
}

/**
 * Fuente de corriente ideal: corriente_a circula por dentro de la fuente, de `desde` hacia `hacia`.
 * `forma` funciona igual que en la fuente de voltaje.
 */
export interface FuenteCorriente extends ElementoBase {
  tipo: 'fuenteCorriente';
  desde: Nodo;
  hacia: Nodo;
  corriente_a: number;
  forma?: FormaDeOnda;
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

/** Bobina ideal: V = L · dI/dt. En DC es un cortocircuito. */
export interface Bobina extends ElementoBase {
  tipo: 'bobina';
  a: Nodo;
  b: Nodo;
  inductancia_h: number;
  /** Corriente de a hacia b al empezar, si el transitorio usa condiciones iniciales. 0 si no se indica. */
  corrienteInicial_a?: number;
}

/** Condensador ideal: I = C · dV/dt. En DC es un circuito abierto. */
export interface Condensador extends ElementoBase {
  tipo: 'condensador';
  a: Nodo;
  b: Nodo;
  capacitancia_f: number;
  /** V(a) − V(b) al empezar, si el transitorio usa condiciones iniciales. 0 si no se indica. */
  voltajeInicial_v?: number;
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
  /**
   * Qué tan redondeada es la esquina, en voltios. Por defecto 1 % de (máximo − mínimo),
   * o 0.02 V si hay topes relativos a nodos.
   */
  suavidad_v?: number;
  /**
   * Si se indica, el tope superior sigue a este nodo: V(+) − V(−) ≤ V(referenciaMaxima) − V(−) + maximo_v.
   * Ejemplo: referenciaMaxima = "vcc" y maximo_v = −1.5 da un tope en "VCC − 1.5 V".
   */
  referenciaMaxima?: Nodo;
  /** Igual para el tope inferior: V(+) − V(−) ≥ V(referenciaMinima) − V(−) + minimo_v. */
  referenciaMinima?: Nodo;
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
