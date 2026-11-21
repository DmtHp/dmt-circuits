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

import type { Circuito, Nodo } from './circuito';
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
  for (const [campo, valor] of [
    ['El paso máximo', opciones.pasoMaximo_s],
    ['El paso inicial', opciones.pasoInicial_s],
  ] as const) {
    if (valor !== undefined && !(Number.isFinite(valor) && valor > 0)) {
      throw new ErrorCircuito('valor_invalido', `${campo} debe ser mayor que 0 s (recibí ${valor}).`);
    }
  }

  const usarCI = opciones.usarCondicionesIniciales ?? false;
  const metodo = opciones.metodo ?? 'trapezoidal';
  const reltol = opciones.toleranciaRelativa ?? 1e-3;
  const vtol = opciones.toleranciaVoltaje_v ?? 1e-6;
  const opcionesNewton: OpcionesNewton = { ...OPCIONES_NEWTON, maxIteraciones: 50, ...opciones.newton };

  // Con punto de operación hace falta que el circuito tenga sentido en DC (condensador abierto, bobina en corto).
  const sistema = prepararSistema(circuito, usarCI ? 'transitorio' : 'dc');
  const formas = sistema.preparados.flatMap((p) => {
    const e = p.elemento;
    return (e.tipo === 'fuenteVoltaje' || e.tipo === 'fuenteCorriente') && e.forma ? [e.forma] : [];
  });

  let pasoMaximo = opciones.pasoMaximo_s ?? tFinal / 50;
  for (const forma of formas) pasoMaximo = Math.min(pasoMaximo, pasoSugerido(forma));
  const pasoMinimo = tFinal * 1e-12;
  /**
   * Los pasos se eligen de la lista pasoMaximo, pasoMaximo/2, pasoMaximo/4, …
   * (redondeando hacia abajo). Así el paso cambia poco y en saltos exactos, y
   * en circuitos lineales muchos pasos comparten la misma factorización.
   */
  const cuantizar = (h: number): number => pasoMaximo / 2 ** Math.max(0, Math.ceil(Math.log2(pasoMaximo / h) - 1e-9));
  const pasoInicial = cuantizar(Math.min(opciones.pasoInicial_s ?? pasoMaximo / 100, pasoMaximo));

  const base: ParametrosAnalisis = {
    modo: 'dc',
    tiempo_s: 0,
    paso_s: 0,
    metodo: 'euler',
    factorFuentes: 1,
    usarFormas: true,
    gmin_s: GMIN_S,
    gminNodos_s: 0,
  };

  const resultado: ResultadoTransitorio = {
    tiempos: [],
    voltajes: new Map(sistema.ordenNodos.map((nodo) => [nodo, []])),
    elementos: new Map(
      sistema.preparados.map((p) => [p.elemento.nombre, { voltaje_v: [], corriente_a: [], potencia_w: [] }]),
    ),
    estadisticas: { pasosAceptados: 0, pasosRechazados: 0, iteracionesNewton: 0, factorizaciones: 0, puntoInicial: 'condiciones' },
  };
  resultado.voltajes.set('0', []);

  // Punto de partida.
  let x = new Float64Array(sistema.n);
  let historial: Punto[] = [];
  if (usarCI) {
    const ceros = medir(sistema, base, x);
    for (const p of sistema.preparados) {
      p.primitiva.iniciarTransitorio?.(p.elemento, p.estado, ceros.elementos.get(p.elemento.nombre)!, true);
    }
  } else {
    const op = resolverPuntoOperacion(sistema, base, undefined, opcionesNewton);
    x = Float64Array.from(op.x);
    resultado.estadisticas.iteracionesNewton += op.iteraciones;
    resultado.estadisticas.puntoInicial = op.estrategia;
    const medidas = registrar(resultado, sistema, base, x, 0);
    for (const p of sistema.preparados) {
      p.primitiva.iniciarTransitorio?.(p.elemento, p.estado, medidas.get(p.elemento.nombre)!, false);
    }
    historial = [{ t: 0, x }];
  }

  const cache = crearCache();
  let t = 0;
  let h = pasoInicial;
  let usarEuler = true;
  /** Pasos que faltan antes de permitir agrandar h otra vez (evita el vaivén crecer → rechazar). */
  let esperaParaCrecer = 0;

  while (t < tFinal - pasoMinimo) {
    // Próximo quiebre (bordes de pulsos o el final).
    let quiebre = tFinal;
    for (const forma of formas) quiebre = Math.min(quiebre, siguienteQuiebre(forma, t));
    let paso = Math.min(h, quiebre - t);
    // Si quedaría un pedacito diminuto antes del quiebre, se llega a él de una vez.
    if (quiebre - t - paso < 0.1 * paso) paso = quiebre - t;
    const llegaAQuiebre = t + paso >= quiebre - pasoMinimo;
    const tNuevo = llegaAQuiebre ? quiebre : t + paso;
    paso = tNuevo - t;

    const metodoPaso: MetodoIntegracion = usarEuler ? 'euler' : metodo;
    const parametros: ParametrosAnalisis = { ...base, modo: 'transitorio', tiempo_s: tNuevo, paso_s: paso, metodo: metodoPaso };
    const r = resolverNewton(sistema, parametros, x, opcionesNewton, cache);
    resultado.estadisticas.iteracionesNewton += r.iteraciones;

    if (!r.convergio) {
      resultado.estadisticas.pasosRechazados++;
      h = cuantizar(paso / 8);
      usarEuler = true;
      if (h < pasoMinimo) throw errorPasoMinimo(t);
      continue;
    }

    // Error estimado del paso.
    const error = estimarError(sistema, historial, tNuevo, r.x, metodoPaso, reltol, vtol);
    if (error > 1) {
      resultado.estadisticas.pasosRechazados++;
      h = cuantizar(paso * Math.max(0.25, 0.9 * error ** (-1 / 3)));
      esperaParaCrecer = 10;
      if (h < pasoMinimo) throw errorPasoMinimo(t);
      continue;
    }

    // Paso aceptado.
    t = tNuevo;
    x = Float64Array.from(r.x);
    resultado.estadisticas.pasosAceptados++;
    const medidas = registrar(resultado, sistema, parametros, x, t);
    for (const p of sistema.preparados) p.primitiva.aceptarPaso?.(p.elemento, p.estado, medidas.get(p.elemento.nombre)!);

    if (llegaAQuiebre) {
      // Después de un quiebre la derivada cambia de golpe: se reinicia con pasos cortos y Euler.
      historial = [{ t, x }];
      usarEuler = true;
      h = pasoInicial;
    } else {
      historial.push({ t, x });
      if (historial.length > 3) historial.shift();
      usarEuler = false;
      // Si sobra mucha precisión, el paso se duplica. Con la trapezoidal el error crece como h³:
      // al duplicar h se multiplica por 8, así que solo se duplica si el error es menor que 1/16.
      if (esperaParaCrecer > 0) esperaParaCrecer--;
      else if (error >= 0 && error < 1 / 16) h = Math.min(2 * h, pasoMaximo);
    }
  }

  resultado.estadisticas.factorizaciones = cache.factorizaciones;
  return resultado;
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

/** Guarda un instante en el resultado y devuelve las medidas de cada elemento. */
function registrar(
  resultado: ResultadoTransitorio,
  sistema: Sistema,
  parametros: ParametrosAnalisis,
  x: Float64Array,
  t: number,
): Map<string, { voltaje_v: number; corriente_a: number }> {
  const { voltajes, elementos } = medir(sistema, parametros, x);
  resultado.tiempos.push(t);
  for (const [nodo, valor] of voltajes) resultado.voltajes.get(nodo)!.push(valor);
  for (const [nombre, m] of elementos) {
    const serie = resultado.elementos.get(nombre)!;
    serie.voltaje_v.push(m.voltaje_v);
    serie.corriente_a.push(m.corriente_a);
    serie.potencia_w.push(m.potencia_w);
  }
  return elementos;
}

function errorPasoMinimo(t: number): ErrorCircuito {
  return new ErrorCircuito(
    'paso_muy_pequeno',
    `La simulación se atascó en t = ${t} s: el paso de tiempo se volvió demasiado pequeño. ` +
      'Suele pasar con cambios casi instantáneos en elementos no lineales. Prueba con tiempos de subida un poco más largos.',
  );
}
