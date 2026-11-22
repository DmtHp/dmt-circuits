/**
 * Análisis transitorio: cómo cambia el circuito en el tiempo.
 *
 * El tiempo avanza en pasos h. En cada paso, condensadores y bobinas se
 * reemplazan por su modelo compañero (una conductancia y una fuente que
 * recuerda el paso anterior), y el paso se resuelve como un problema DC,
 * con Newton-Raphson si hay elementos no lineales.
 *
 * - Punto de partida: el punto de operación DC en t = 0 (o, si se pide, las
 *   condiciones iniciales de cada condensador y bobina).
 * - Método: trapezoidal (preciso); Euler hacia atrás en el primer paso y
 *   justo después de un quiebre, porque la trapezoidal oscila ante saltos.
 * - Paso adaptativo: después de cada paso se estima el error comparando la
 *   solución con una extrapolación de los puntos anteriores. Si el error es
 *   grande, el paso se rechaza y se repite más corto; si es muy pequeño, el
 *   paso siguiente se duplica.
 * - Quiebres: los bordes de los pulsos caen siempre justo en un paso.
 * - En circuitos lineales con el mismo paso, la factorización de la matriz
 *   se reutiliza: cada paso es solo sustitución.
 */

import type { Circuito, FormaDeOnda, Nodo } from './circuito';
import { ErrorCircuito } from './errores';
import { pasoSugerido, siguienteQuiebre } from './formasDeOnda';
import {
  crearCache,
  GMIN_S,
  OPCIONES_NEWTON,
  resolverNewton,
  resolverPuntoOperacion,
  type Estrategia,
  type OpcionesNewton,
} from './newton';
import type { MetodoIntegracion } from './primitivas';
import { medir, prepararSistema, type ParametrosAnalisis, type Sistema } from './sistema';

export interface OpcionesTransitorio {
  /** Hasta qué tiempo simular, en segundos. */
  tiempoFinal_s: number;
  /** Paso máximo. Por defecto tiempoFinal/50 (y 20 puntos por ciclo de cada seno). */
  pasoMaximo_s?: number;
  /** Paso al empezar y después de cada quiebre. Por defecto pasoMaximo/100. */
  pasoInicial_s?: number;
  /** Por defecto 'trapezoidal'. */
  metodo?: MetodoIntegracion;
  /** true: arranca desde voltajeInicial_v / corrienteInicial_a (0 si faltan) en vez del punto DC. */
  usarCondicionesIniciales?: boolean;
  /** Error relativo aceptado por paso. Por defecto 1e-3. */
  toleranciaRelativa?: number;
  /** Error absoluto aceptado por paso, en voltios. Por defecto 1e-6. */
  toleranciaVoltaje_v?: number;
  /** Opciones de Newton-Raphson para cada paso. */
  newton?: Partial<OpcionesNewton>;
}

export interface SerieElemento {
  voltaje_v: number[];
  corriente_a: number[];
  potencia_w: number[];
}

export interface ResultadoTransitorio {
  /** Instantes calculados (no equiespaciados: el paso es adaptativo). */
  tiempos: number[];
  /** Voltaje de cada nodo en cada instante. */
  voltajes: Map<Nodo, number[]>;
  /** Voltaje, corriente y potencia de cada elemento en cada instante. */
  elementos: Map<string, SerieElemento>;
  estadisticas: {
    pasosAceptados: number;
    pasosRechazados: number;
    iteracionesNewton: number;
    factorizaciones: number;
    /** Cómo se encontró el punto de partida ('condiciones' si se usaron condiciones iniciales). */
    puntoInicial: Estrategia | 'condiciones';
  };
}

/** Coeficiente de error de la trapezoidal comparado con un predictor cuadrático: 1/12 ÷ (1 + 1/12) = 1/13. */
const FACTOR_ERROR_TRAPEZOIDAL = 1 / 13;
/** Para Euler hacia atrás frente a un predictor lineal: 1/2 ÷ (1 + 1/2) = 1/3. */
const FACTOR_ERROR_EULER = 1 / 3;

interface Punto {
  t: number;
  x: Float64Array;
}

export function analizarTransitorio(circuito: Circuito, opciones: OpcionesTransitorio): ResultadoTransitorio {
  const tFinal = opciones.tiempoFinal_s;
  if (!(Number.isFinite(tFinal) && tFinal > 0)) {
    throw new ErrorCircuito('valor_invalido', `El tiempo final debe ser mayor que 0 s (recibí ${tFinal}).`);
  }
  const sesion = new SesionTransitorio(circuito, { ...opciones, pasoMaximo_s: opciones.pasoMaximo_s ?? tFinal / 50, tiempoFinal_s: tFinal });
  return sesion.avanzar(tFinal);
}

export interface OpcionesSesion extends Omit<OpcionesTransitorio, 'tiempoFinal_s' | 'pasoMaximo_s'> {
  /** Paso máximo (obligatorio: en una sesión abierta no hay tiempo final del que deducirlo). */
  pasoMaximo_s: number;
  /** Si se conoce, el tiempo final: la simulación no lo pasa. */
  tiempoFinal_s?: number;
}

/**
 * Una simulación en el tiempo que avanza por partes: `avanzar(hasta)` calcula
 * desde donde quedó hasta `hasta` (o hasta agotar un presupuesto de tiempo de
 * cómputo) y devuelve solo los puntos nuevos. Así la interfaz puede simular
 * "en tiempo real", un pedazo por cada cuadro de pantalla.
 *
 * Mientras corre se pueden cambiar valores (girar un potenciómetro, cerrar un
 * interruptor) con `actualizarValores`, sin perder la carga de los
 * condensadores ni la corriente de las bobinas.
 */
export class SesionTransitorio {
  private readonly sistema: Sistema;
  private readonly metodo: MetodoIntegracion;
  private readonly reltol: number;
  private readonly vtol: number;
  private readonly opcionesNewton: OpcionesNewton;
  private readonly tFinal: number;
  private readonly pasoMaximoBase: number;
  private pasoMaximo = 0;
  private pasoInicial = 0;
  private readonly pasoMinimo: number;
  private formas: FormaDeOnda[] = [];
  private readonly base: ParametrosAnalisis = {
    modo: 'dc',
    tiempo_s: 0,
    paso_s: 0,
    metodo: 'euler',
    factorFuentes: 1,
    usarFormas: true,
    gmin_s: GMIN_S,
    gminNodos_s: 0,
  };
  private cache = crearCache();
  private x: Float64Array;
  private historial: Punto[] = [];
  private t = 0;
  private h = 0;
  private usarEuler = true;
  /** Pasos que faltan antes de permitir agrandar h otra vez (evita el vaivén crecer → rechazar). */
  private esperaParaCrecer = 0;
  private pendiente: ResultadoTransitorio;
  /** Totales desde el comienzo. */
  readonly estadisticas: ResultadoTransitorio['estadisticas'] = {
    pasosAceptados: 0,
    pasosRechazados: 0,
    iteracionesNewton: 0,
    factorizaciones: 0,
    puntoInicial: 'condiciones',
  };

  constructor(circuito: Circuito, opciones: OpcionesSesion) {
    for (const [campo, valor] of [
      ['El paso máximo', opciones.pasoMaximo_s],
      ['El paso inicial', opciones.pasoInicial_s],
    ] as const) {
      if (valor !== undefined && !(Number.isFinite(valor) && valor > 0)) {
        throw new ErrorCircuito('valor_invalido', `${campo} debe ser mayor que 0 s (recibí ${valor}).`);
      }
    }
    const usarCI = opciones.usarCondicionesIniciales ?? false;
    this.metodo = opciones.metodo ?? 'trapezoidal';
    this.reltol = opciones.toleranciaRelativa ?? 1e-3;
    this.vtol = opciones.toleranciaVoltaje_v ?? 1e-6;
    this.opcionesNewton = { ...OPCIONES_NEWTON, maxIteraciones: 50, ...opciones.newton };
    this.tFinal = opciones.tiempoFinal_s ?? Number.POSITIVE_INFINITY;
    this.pasoMaximoBase = opciones.pasoMaximo_s;
    this.pasoMinimo = opciones.pasoMaximo_s * 1e-10;

    // Con punto de operación hace falta que el circuito tenga sentido en DC (condensador abierto, bobina en corto).
    this.sistema = prepararSistema(circuito, usarCI ? 'transitorio' : 'dc');
    this.calcularPasos(opciones.pasoInicial_s);
    this.h = this.pasoInicial;
    this.pendiente = this.resultadoVacio();

    // Punto de partida.
    this.x = new Float64Array(this.sistema.n);
    if (usarCI) {
      const ceros = medir(this.sistema, this.base, this.x);
      for (const p of this.sistema.preparados) {
        p.primitiva.iniciarTransitorio?.(p.elemento, p.estado, ceros.elementos.get(p.elemento.nombre)!, true);
      }
    } else {
      const op = resolverPuntoOperacion(this.sistema, this.base, undefined, this.opcionesNewton);
      this.x = Float64Array.from(op.x);
      this.estadisticas.iteracionesNewton += op.iteraciones;
      this.estadisticas.puntoInicial = op.estrategia;
      const medidas = this.registrar(this.base, 0);
      for (const p of this.sistema.preparados) {
        p.primitiva.iniciarTransitorio?.(p.elemento, p.estado, medidas.get(p.elemento.nombre)!, false);
      }
      this.historial = [{ t: 0, x: this.x }];
    }
  }

  /** Tiempo simulado hasta ahora. */
  get tiempo_s(): number {
    return this.t;
  }

  /**
   * Avanza hasta `hasta_s` (sin pasar el tiempo final, si lo hay). Si se da
   * `presupuesto_ms`, se detiene antes cuando se acaba ese tiempo de cómputo.
   * Devuelve los puntos calculados en esta llamada (y el punto inicial en la primera).
   */
  avanzar(hasta_s: number, presupuesto_ms = Number.POSITIVE_INFINITY): ResultadoTransitorio {
    const objetivo = Math.min(hasta_s, this.tFinal);
    const conPresupuesto = presupuesto_ms < Number.POSITIVE_INFINITY;
    const inicio = conPresupuesto ? performance.now() : 0;
    while (this.t < objetivo - this.pasoMinimo) {
      this.paso(objetivo);
      if (conPresupuesto && performance.now() - inicio > presupuesto_ms) break;
    }
    this.estadisticas.factorizaciones = this.cache.factorizaciones;
    const salida = this.pendiente;
    salida.estadisticas = { ...this.estadisticas };
    this.pendiente = this.resultadoVacio();
    return salida;
  }

  /**
   * Cambia valores de elementos sin reiniciar (por ejemplo, una resistencia o
   * la posición de un interruptor). El circuito debe tener los mismos
   * elementos, del mismo tipo y conectados a los mismos nodos; si no, lanza
   * un error y hay que empezar una sesión nueva.
   */
  actualizarValores(circuito: Circuito): void {
    const nuevos = new Map(circuito.elementos.map((e) => [e.nombre, e]));
    const revisado = prepararSistema(circuito, 'transitorio');
    const mismaForma =
      nuevos.size === this.sistema.preparados.length &&
      this.sistema.preparados.every((p) => {
        const otro = revisado.preparados.find((q) => q.elemento.nombre === p.elemento.nombre);
        return (
          otro !== undefined &&
          otro.elemento.tipo === p.elemento.tipo &&
          otro.terminales.join('|') === p.terminales.join('|') &&
          otro.control.join('|') === p.control.join('|')
        );
      });
    if (!mismaForma) throw new Error('El circuito cambió de forma: hay que empezar una sesión nueva.');
    for (const p of this.sistema.preparados) p.elemento = nuevos.get(p.elemento.nombre)!;
    this.cache = crearCache();
    this.calcularPasos(undefined);
    // El cambio es un salto: se sigue con pasos cortos y Euler, como después de un quiebre.
    this.historial = [{ t: this.t, x: this.x }];
    this.usarEuler = true;
    this.h = this.pasoInicial;
  }

  private calcularPasos(pasoInicial_s: number | undefined): void {
    this.formas = this.sistema.preparados.flatMap((p) => {
      const e = p.elemento;
      return (e.tipo === 'fuenteVoltaje' || e.tipo === 'fuenteCorriente') && e.forma ? [e.forma] : [];
    });
    let pasoMaximo = this.pasoMaximoBase;
    for (const forma of this.formas) pasoMaximo = Math.min(pasoMaximo, pasoSugerido(forma));
    this.pasoMaximo = pasoMaximo;
    this.pasoInicial = this.cuantizar(Math.min(pasoInicial_s ?? pasoMaximo / 100, pasoMaximo));
  }

  /**
   * Los pasos se eligen de la lista pasoMaximo, pasoMaximo/2, pasoMaximo/4, …
   * (redondeando hacia abajo). Así el paso cambia poco y en saltos exactos, y
   * en circuitos lineales muchos pasos comparten la misma factorización.
   */
  private cuantizar(h: number): number {
    return this.pasoMaximo / 2 ** Math.max(0, Math.ceil(Math.log2(this.pasoMaximo / h) - 1e-9));
  }

  /** Intenta un paso hacia `objetivo`; si lo rechaza, ajusta h para el próximo intento. */
  private paso(objetivo: number): void {
    const t = this.t;
    // Próximo quiebre (bordes de pulsos), sin pasar el objetivo de esta llamada.
    let quiebreForma = Number.POSITIVE_INFINITY;
    for (const forma of this.formas) quiebreForma = Math.min(quiebreForma, siguienteQuiebre(forma, t));
    const esQuiebreReal = quiebreForma <= objetivo;
    const quiebre = Math.min(quiebreForma, objetivo);
    let paso = Math.min(this.h, quiebre - t);
    // Si quedaría un pedacito diminuto antes del quiebre, se llega a él de una vez.
    if (quiebre - t - paso < 0.1 * paso) paso = quiebre - t;
    const llegaAQuiebre = t + paso >= quiebre - this.pasoMinimo;
    const tNuevo = llegaAQuiebre ? quiebre : t + paso;
    paso = tNuevo - t;

    const metodoPaso: MetodoIntegracion = this.usarEuler ? 'euler' : this.metodo;
    const parametros: ParametrosAnalisis = { ...this.base, modo: 'transitorio', tiempo_s: tNuevo, paso_s: paso, metodo: metodoPaso };
    const r = resolverNewton(this.sistema, parametros, this.x, this.opcionesNewton, this.cache);
    this.estadisticas.iteracionesNewton += r.iteraciones;

    if (!r.convergio) {
      this.estadisticas.pasosRechazados++;
      this.h = this.cuantizar(paso / 8);
      this.usarEuler = true;
      if (this.h < this.pasoMinimo) throw errorPasoMinimo(t);
      return;
    }

    // Error estimado del paso.
    const error = estimarError(this.sistema, this.historial, tNuevo, r.x, metodoPaso, this.reltol, this.vtol);
    if (error > 1) {
      this.estadisticas.pasosRechazados++;
      this.h = this.cuantizar(paso * Math.max(0.25, 0.9 * error ** (-1 / 3)));
      this.esperaParaCrecer = 10;
      if (this.h < this.pasoMinimo) throw errorPasoMinimo(t);
      return;
    }

    // Paso aceptado.
    this.t = tNuevo;
    this.x = Float64Array.from(r.x);
    this.estadisticas.pasosAceptados++;
    const medidas = this.registrar(parametros, tNuevo);
    for (const p of this.sistema.preparados) p.primitiva.aceptarPaso?.(p.elemento, p.estado, medidas.get(p.elemento.nombre)!);

    if (llegaAQuiebre && esQuiebreReal) {
      // Después de un quiebre la derivada cambia de golpe: se reinicia con pasos cortos y Euler.
      this.historial = [{ t: tNuevo, x: this.x }];
      this.usarEuler = true;
      this.h = this.pasoInicial;
    } else {
      this.historial.push({ t: tNuevo, x: this.x });
      if (this.historial.length > 3) this.historial.shift();
      this.usarEuler = false;
      // Si sobra mucha precisión, el paso se duplica. Con la trapezoidal el error crece como h³:
      // al duplicar h se multiplica por 8, así que solo se duplica si el error es menor que 1/16.
      if (this.esperaParaCrecer > 0) this.esperaParaCrecer--;
      else if (error >= 0 && error < 1 / 16) this.h = Math.min(2 * this.h, this.pasoMaximo);
    }
  }

  private resultadoVacio(): ResultadoTransitorio {
    const voltajes = new Map<Nodo, number[]>(this.sistema.ordenNodos.map((nodo) => [nodo, []]));
    voltajes.set('0', []);
    return {
      tiempos: [],
      voltajes,
      elementos: new Map(this.sistema.preparados.map((p) => [p.elemento.nombre, { voltaje_v: [], corriente_a: [], potencia_w: [] }])),
      estadisticas: { ...this.estadisticas },
    };
  }

  /** Guarda un instante en el resultado pendiente y devuelve las medidas de cada elemento. */
  private registrar(parametros: ParametrosAnalisis, t: number): Map<string, { voltaje_v: number; corriente_a: number }> {
    const { voltajes, elementos } = medir(this.sistema, parametros, this.x);
    const r = this.pendiente;
    r.tiempos.push(t);
    for (const [nodo, valor] of voltajes) r.voltajes.get(nodo)!.push(valor);
    for (const [nombre, m] of elementos) {
      const serie = r.elementos.get(nombre)!;
      serie.voltaje_v.push(m.voltaje_v);
      serie.corriente_a.push(m.corriente_a);
      serie.potencia_w.push(m.potencia_w);
    }
    return elementos;
  }
}

/**
 * Estima el error del paso. Devuelve error/tolerancia (≤ 1 es aceptable), o
 * -1 si todavía no hay puntos suficientes para estimarlo.
 *
 * Idea: con los puntos anteriores se extrapola un "predictor" hasta tNuevo.
 * La diferencia entre la solución calculada y el predictor es proporcional al
 * error del método, y la constante depende del método (ver FACTOR_ERROR_*).
 */
function estimarError(
  sistema: Sistema,
  historial: Punto[],
  tNuevo: number,
  xNuevo: Float64Array,
  metodo: MetodoIntegracion,
  reltol: number,
  vtol: number,
): number {
  const necesarios = metodo === 'trapezoidal' ? 3 : 2;
  if (historial.length < necesarios) return -1;
  const puntos = historial.slice(-necesarios);
  const factor = metodo === 'trapezoidal' ? FACTOR_ERROR_TRAPEZOIDAL : FACTOR_ERROR_EULER;

  // Pesos de Lagrange para extrapolar el polinomio que pasa por los puntos.
  const pesos = puntos.map((pi, i) => {
    let w = 1;
    puntos.forEach((pj, j) => {
      if (j !== i) w *= (tNuevo - pj.t) / (pi.t - pj.t);
    });
    return w;
  });

  let peor = 0;
  for (let k = 0; k < sistema.ordenNodos.length; k++) {
    let prediccion = 0;
    for (let i = 0; i < puntos.length; i++) prediccion += pesos[i]! * puntos[i]!.x[k]!;
    const valor = xNuevo[k]!;
    const tolerancia = reltol * Math.max(Math.abs(valor), Math.abs(prediccion)) + vtol;
    peor = Math.max(peor, (factor * Math.abs(valor - prediccion)) / tolerancia);
  }
  return peor;
}

function errorPasoMinimo(t: number): ErrorCircuito {
  return new ErrorCircuito(
    'paso_muy_pequeno',
    `La simulación se atascó en t = ${t} s: el paso de tiempo se volvió demasiado pequeño. ` +
      'Suele pasar con cambios casi instantáneos en elementos no lineales. Prueba con tiempos de subida un poco más largos.',
  );
}
