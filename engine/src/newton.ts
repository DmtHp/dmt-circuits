/**
 * Newton-Raphson: cómo se resuelven circuitos no lineales.
 *
 * 1. Se parte de una suposición x (todo en 0, o la solución anterior).
 * 2. Cada elemento no lineal se reemplaza por su recta tangente en ese punto,
 *    y el circuito queda lineal: A · x = z, como en la Etapa 1.
 * 3. Se resuelve, se toma el resultado como nueva suposición y se repite.
 * 4. Se para cuando la solución deja de cambiar (convergió) o al llegar al
 *    máximo de iteraciones (no convergió: se prueba un plan B).
 *
 * Cerca de la solución, cada iteración duplica las cifras correctas, así que
 * casi siempre bastan pocas vueltas.
 */

import { ErrorCircuito } from './errores';
import { ErrorMatrizSingular, type Factorizacion, type Matriz } from './matriz';
import { MatrizDispersa } from './matrizDispersa';
import {
  crearContexto,
  describirIncognita,
  ensamblar,
  errorSingular,
  reiniciarEstados,
  type ParametrosAnalisis,
  type Sistema,
} from './sistema';

export interface OpcionesNewton {
  /** Máximo de iteraciones por intento. */
  maxIteraciones: number;
  /** Cambio relativo aceptado entre iteraciones. */
  toleranciaRelativa: number;
  /** Cambio absoluto aceptado en voltajes. */
  toleranciaVoltaje_v: number;
  /** Cambio absoluto aceptado en corrientes (incógnitas extra). */
  toleranciaCorriente_a: number;
}

export const OPCIONES_NEWTON: OpcionesNewton = {
  maxIteraciones: 100,
  toleranciaRelativa: 1e-6,
  toleranciaVoltaje_v: 1e-9,
  toleranciaCorriente_a: 1e-12,
};

/** Conductancia mínima en paralelo con cada unión, en siemens (como en SPICE). */
export const GMIN_S = 1e-12;

export interface ResultadoNewton {
  x: Float64Array;
  iteraciones: number;
  convergio: boolean;
  /** Incógnita que más cambió en la última iteración (para explicar un fallo). */
  peorIncognita: number;
}

/**
 * Guarda una factorización para reutilizarla cuando la matriz no cambia
 * (circuito lineal con el mismo paso de tiempo): así cada paso es solo sustitución.
 */
export interface CacheFactorizacion {
  clave: string;
  factorizacion: Factorizacion | null;
  /** Cuántas veces se factorizó (para medir el rendimiento). */
  factorizaciones: number;
  /** La matriz se reutiliza entre llamadas: así también se reutiliza su orden de pivotes. */
  matriz: MatrizDispersa | null;
}

export function crearCache(): CacheFactorizacion {
  return { clave: '', factorizacion: null, factorizaciones: 0, matriz: null };
}

export function resolverNewton(
  sistema: Sistema,
  parametros: ParametrosAnalisis,
  xInicial: Float64Array,
  opciones: OpcionesNewton = OPCIONES_NEWTON,
  cache: CacheFactorizacion = crearCache(),
): ResultadoNewton {
  const { n } = sistema;
  if (!cache.matriz || cache.matriz.n !== n) cache.matriz = new MatrizDispersa(n);
  const matriz = cache.matriz;
  const z = new Float64Array(n);
  let x: Float64Array = Float64Array.from(xInicial);
  const nNodos = sistema.ordenNodos.length;
  const vigiladas = incognitasNoLineales(sistema);

  for (let iteracion = 1; iteracion <= opciones.maxIteraciones; iteracion++) {
    let limitado = false;
    const ctx = crearContexto(sistema, parametros, x, () => {
      limitado = true;
    });

    let factorizacion: Factorizacion;
    if (!sistema.noLineal) {
      // Lineal: la matriz solo depende del modo, el paso y el método.
      const clave = `${parametros.modo}|${parametros.paso_s}|${parametros.metodo}|${parametros.gminNodos_s}`;
      const reutilizar = cache.factorizacion !== null && cache.clave === clave;
      ensamblar(sistema, ctx, reutilizar ? null : matriz, z);
      if (!reutilizar) {
        cache.factorizacion = factorizar(sistema, matriz);
        cache.clave = clave;
        cache.factorizaciones++;
      }
      factorizacion = cache.factorizacion!;
    } else {
      ensamblar(sistema, ctx, matriz, z);
      factorizacion = factorizar(sistema, matriz);
      cache.factorizaciones++;
    }

    const xNuevo = factorizacion.resolver(z);
    if (!xNuevo.every(Number.isFinite)) throw errorSingular(sistema, -1);

    if (!sistema.noLineal) return { x: xNuevo, iteraciones: iteracion, convergio: true, peorIncognita: -1 };

    // ¿Cambió poco cada incógnita?
    let convergio = !limitado;
    let peorIncognita = -1;
    let peorRazon = 0;
    for (let i = 0; i < n; i++) {
      const nuevo = xNuevo[i]!;
      const viejo = x[i]!;
      const absoluta = i < nNodos ? opciones.toleranciaVoltaje_v : opciones.toleranciaCorriente_a;
      const tolerancia = opciones.toleranciaRelativa * Math.max(Math.abs(nuevo), Math.abs(viejo)) + absoluta;
      const razon = Math.abs(nuevo - viejo) / tolerancia;
      if (razon > peorRazon && vigiladas.has(i)) {
        peorRazon = razon;
        peorIncognita = i;
      }
      if (razon > 1) convergio = false;
    }
    x = xNuevo;
    if (convergio) return { x, iteraciones: iteracion, convergio: true, peorIncognita: -1 };
    if (iteracion === opciones.maxIteraciones) return { x, iteraciones: iteracion, convergio: false, peorIncognita };
  }
  return { x, iteraciones: opciones.maxIteraciones, convergio: false, peorIncognita: -1 };
}

/** Incógnitas que tocan elementos no lineales: ahí se busca al culpable si no converge. */
function incognitasNoLineales(sistema: Sistema): Set<number> {
  const resultado = new Set<number>();
  for (const p of sistema.preparados) {
    if (!p.primitiva.noLineal) continue;
    for (const nodo of [...p.terminales, ...p.control]) {
      const i = sistema.indices.get(nodo);
      if (i !== undefined) resultado.add(i);
    }
    if (p.extra >= 0) resultado.add(p.extra);
  }
  return resultado;
}

function factorizar(sistema: Sistema, matriz: Matriz): Factorizacion {
  try {
    return matriz.factorizar();
  } catch (error) {
    if (error instanceof ErrorMatrizSingular) throw errorSingular(sistema, error.columna);
    throw error;
  }
}

export type Estrategia = 'directo' | 'gmin' | 'fuentes';

export interface ResultadoPuntoOperacion {
  x: Float64Array;
  iteraciones: number;
  estrategia: Estrategia;
}

/**
 * Busca el punto de operación con plan B:
 * 1. Directo: Newton-Raphson desde la suposición inicial.
 * 2. Conductancia mínima (gmin): se conecta cada nodo a tierra con una
 *    conductancia grande (1e-2 S, como una resistencia de 100 Ω), que hace el
 *    circuito "casi lineal" y fácil. Se resuelve, y se va achicando
 *    (1e-3, 1e-4, …) usando cada solución como punto de partida, hasta quitarla.
 * 3. Encendido gradual de fuentes: se resuelve con todas las fuentes en 0
 *    (solución trivial) y se van subiendo poco a poco hasta el 100 %.
 * Si nada funciona, se informa qué nodo o elemento no se estabilizó.
 */
export function resolverPuntoOperacion(
  sistema: Sistema,
  parametros: ParametrosAnalisis,
  xInicial: Float64Array = new Float64Array(sistema.n),
  opciones: OpcionesNewton = OPCIONES_NEWTON,
): ResultadoPuntoOperacion {
  let iteraciones = 0;

  // 1. Directo.
  const directo = resolverNewton(sistema, parametros, xInicial, opciones);
  iteraciones += directo.iteraciones;
  if (directo.convergio) return { x: directo.x, iteraciones, estrategia: 'directo' };
  const peor = directo.peorIncognita;

  // 2. Conductancia mínima decreciente.
  reiniciarEstados(sistema);
  let x: Float64Array | null = new Float64Array(sistema.n);
  for (let exponente = -2; x && exponente >= -12; exponente--) {
    const r = resolverNewton(sistema, { ...parametros, gminNodos_s: 10 ** exponente }, x, opciones);
    iteraciones += r.iteraciones;
    x = r.convergio ? r.x : null;
  }
  if (x) {
    const r = resolverNewton(sistema, { ...parametros, gminNodos_s: 0 }, x, opciones);
    iteraciones += r.iteraciones;
    if (r.convergio) return { x: r.x, iteraciones, estrategia: 'gmin' };
  }

  // 3. Encendido gradual de fuentes.
  reiniciarEstados(sistema);
  let factor = 0;
  let paso = 0.1;
  let xFuentes: Float64Array = new Float64Array(sistema.n);
  const cero = resolverNewton(sistema, { ...parametros, factorFuentes: 0 }, xFuentes, opciones);
  iteraciones += cero.iteraciones;
  if (cero.convergio) {
    xFuentes = cero.x;
    while (factor < 1 && paso >= 1e-4) {
      const siguiente = Math.min(1, factor + paso);
      const r = resolverNewton(sistema, { ...parametros, factorFuentes: siguiente * parametros.factorFuentes }, xFuentes, opciones);
      iteraciones += r.iteraciones;
      if (r.convergio) {
        factor = siguiente;
        xFuentes = r.x;
        paso = Math.min(paso * 1.5, 0.25);
      } else {
        paso /= 2;
      }
    }
    if (factor >= 1) return { x: xFuentes, iteraciones, estrategia: 'fuentes' };
  }

  const { texto, nodos, elementos } = describirIncognita(sistema, peor);
  const noLineales = sistema.preparados
    .filter((p) => p.primitiva.noLineal && (elementos.length === 0 || elementos.includes(p.elemento.nombre)))
    .map((p) => p.elemento.nombre);
  throw new ErrorCircuito(
    'no_converge',
    `No logré encontrar el punto de operación: ${texto} no se estabiliza` +
      (noLineales.length > 0 ? ` (revisa ${noLineales.join(', ')})` : '') +
      '. Probé tres estrategias (directa, conductancia mínima y encendido gradual de fuentes). ' +
      'Suele pasar con valores extremos o con realimentación positiva que no tiene un punto estable.',
    { nodos, elementos: noLineales },
  );
}
