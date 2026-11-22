import type { Limitador } from '../circuito';
import { exigirFinito, exigirPositivoOpcional, type Contexto, type Primitiva } from './primitiva';

interface EstadoLimitador {
  /** Entrada u = ganancia · (Vc+ − Vc−) usada en la iteración anterior. */
  u: number;
}

/** ln(1 + e^x) sin desbordarse para x grande. */
function softplus(x: number): number {
  return x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x));
}

/** 1 / (1 + e^−x), la derivada de softplus. */
function sigmoide(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

/** Suavidad por defecto si no se indica. Con topes relativos a nodos el rango no se conoce de antemano. */
const SUAVIDAD_RELATIVA_POR_DEFECTO_V = 0.02;

function tieneReferencias(e: Limitador): boolean {
  return e.referenciaMaxima !== undefined || e.referenciaMinima !== undefined;
}

function suavidad(e: Limitador): number {
  if (e.suavidad_v !== undefined) return e.suavidad_v;
  return tieneReferencias(e) ? SUAVIDAD_RELATIVA_POR_DEFECTO_V : (e.maximo_v - e.minimo_v) / 100;
}

export interface PuntoLimitador {
  salida_v: number;
  /** df/du */
  pendiente: number;
  /** df/d(máximo): cuánto se mueve la salida si se mueve el tope superior. */
  pendienteMaximo: number;
  /** df/d(mínimo) */
  pendienteMinimo: number;
}

/**
 * La curva del limitador y sus pendientes:
 *   f(u) = u − s·ln(1 + e^((u − máx)/s)) + s·ln(1 + e^((mín − u)/s))
 *
 * Lejos de los topes los dos logaritmos son casi 0 y f(u) ≈ u (copia la entrada).
 * Muy por encima del máximo, el primer término se come el exceso y f(u) → máx.
 * Muy por debajo del mínimo, el segundo lo compensa y f(u) → mín.
 * s controla qué tan redondeada es la esquina.
 *
 * `maximo` y `minimo` son los topes efectivos; por defecto, los fijos del elemento.
 */
export function curvaLimitador(e: Limitador, u: number, maximo = e.maximo_v, minimo = e.minimo_v): PuntoLimitador {
  const s = suavidad(e);
  const arriba = (u - maximo) / s;
  const abajo = (minimo - u) / s;
  const sArriba = sigmoide(arriba);
  const sAbajo = sigmoide(abajo);
  return {
    salida_v: u - s * softplus(arriba) + s * softplus(abajo),
    pendiente: 1 - sArriba - sAbajo,
    pendienteMaximo: sArriba,
    pendienteMinimo: sAbajo,
  };
}

/**
 * Topes efectivos para V(+) − V(−). Con un nodo de referencia, el tope sigue
 * a ese nodo: máximo = maximo_v + V(referenciaMaxima) − V(−). Así un op-amp
 * alimentado con VCC satura en "VCC − 1.5 V" aunque VCC cambie.
 */
function topes(e: Limitador, ctx: Contexto): { maximo: number; minimo: number; desplazMax: number; desplazMin: number } {
  const vNeg = ctx.voltaje(e.negativo);
  const desplazMax = e.referenciaMaxima !== undefined ? ctx.voltaje(e.referenciaMaxima) - vNeg : 0;
  const desplazMin = e.referenciaMinima !== undefined ? ctx.voltaje(e.referenciaMinima) - vNeg : 0;
  return { maximo: e.maximo_v + desplazMax, minimo: e.minimo_v + desplazMin, desplazMax, desplazMin };
}

/** Cuántas "suavidades" más allá del tope empieza la zona saturada. */
const MARGEN_SATURACION = 5;

/**
 * Limitador suave (fuente de voltaje controlada no lineal):
 *   V+ − V− = f(u, máx, mín),   u = ganancia · (Vc+ − Vc−)
 *
 * Linealizado alrededor del punto anterior (u0, máx0, mín0), con fu = df/du,
 * fM = df/dmáx y fm = df/dmín:
 *   V+ − V− − fu·ganancia·(Vc+ − Vc−) − fM·Δmáx − fm·Δmín = f0 − fu·u0 − fM·Δmáx0 − fm·Δmín0
 * donde Δmáx = V(refMáx) − V(−) y Δmín = V(refMín) − V(−) (0 si no hay referencia).
 *
 * Ayuda a converger: en saturación la pendiente es casi 0 y Newton-Raphson
 * puede saltar de un tope al otro sin parar. Por eso, si u pasa de no saturado
 * a muy saturado de un golpe, se detiene en el borde de la saturación, donde
 * la pendiente todavía guía bien al método.
 */
export const primitivaLimitador: Primitiva<Limitador, EstadoLimitador> = {
  conexionDC: 'fijaVoltaje',
  variablesExtra: 1,
  noLineal: true,
  terminales: (e) => [e.positivo, e.negativo],
  terminalesControl: (e) => [
    e.controlPositivo,
    e.controlNegativo,
    ...(e.referenciaMaxima !== undefined ? [e.referenciaMaxima] : []),
    ...(e.referenciaMinima !== undefined ? [e.referenciaMinima] : []),
  ],
  validar: (e) => {
    const problemas = [
      ...exigirFinito(e.ganancia, 'La ganancia'),
      ...exigirFinito(e.minimo_v, 'El mínimo'),
      ...exigirFinito(e.maximo_v, 'El máximo'),
      ...exigirPositivoOpcional(e.suavidad_v, 'La suavidad', 'V'),
    ];
    if (problemas.length === 0 && !tieneReferencias(e) && !(e.maximo_v > e.minimo_v)) {
      problemas.push(`El máximo (${e.maximo_v} V) debe ser mayor que el mínimo (${e.minimo_v} V).`);
    }
    return problemas;
  },
  crearEstado: (e) => ({ u: tieneReferencias(e) ? 0 : Math.min(Math.max(0, e.minimo_v), e.maximo_v) }),
  estampar(e, est, ctx, extra, estado) {
    const s = suavidad(e);
    const { maximo, minimo, desplazMax, desplazMin } = topes(e, ctx);
    const bordeAlto = maximo + MARGEN_SATURACION * s;
    const bordeBajo = minimo - MARGEN_SATURACION * s;
    const uNuevo = e.ganancia * (ctx.voltaje(e.controlPositivo) - ctx.voltaje(e.controlNegativo));
    let u = uNuevo;
    if (uNuevo >= bordeAlto && estado.u < bordeAlto) u = bordeAlto;
    else if (uNuevo <= bordeBajo && estado.u > bordeBajo) u = bordeBajo;
    if (u !== uNuevo) ctx.avisarLimitado();
    estado.u = u;

    const f = curvaLimitador(e, u, maximo, minimo);
    const k = f.pendiente * e.ganancia;
    const p = est.indiceNodo(e.positivo);
    const n = est.indiceNodo(e.negativo);
    const cp = est.indiceNodo(e.controlPositivo);
    const cn = est.indiceNodo(e.controlNegativo);
    est.sumarA(p, extra, 1);
    est.sumarA(n, extra, -1);
    est.sumarA(extra, p, 1);
    est.sumarA(extra, n, -1);
    est.sumarA(extra, cp, -k);
    est.sumarA(extra, cn, k);
    let z = f.salida_v - f.pendiente * u;
    if (e.referenciaMaxima !== undefined) {
      const r = est.indiceNodo(e.referenciaMaxima);
      est.sumarA(extra, r, -f.pendienteMaximo);
      est.sumarA(extra, n, f.pendienteMaximo);
      z -= f.pendienteMaximo * desplazMax;
    }
    if (e.referenciaMinima !== undefined) {
      const r = est.indiceNodo(e.referenciaMinima);
      est.sumarA(extra, r, -f.pendienteMinimo);
      est.sumarA(extra, n, f.pendienteMinimo);
      z -= f.pendienteMinimo * desplazMin;
    }
    est.sumarZ(extra, z);
  },
  corriente: (_e, ctx, extra) => ctx.valorExtra(extra),
};
