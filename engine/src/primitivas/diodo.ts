import type { Diodo } from '../circuito';
import { exigirPositivoOpcional, type Primitiva } from './primitiva';

/** Voltaje térmico Vt = k·T/q a 27 °C (300.15 K): unos 25.86 mV. */
export const VOLTAJE_TERMICO_V = (1.380649e-23 * 300.15) / 1.602176634e-19;

const IS_POR_DEFECTO_A = 1e-14;
const N_POR_DEFECTO = 1;
const IBV_POR_DEFECTO_A = 1e-3;

interface EstadoDiodo {
  /** Voltaje de la unión usado en la iteración anterior (ya limitado). */
  vd: number;
}

interface Parametros {
  is: number;
  nVt: number;
  bv: number | undefined;
  ibv: number;
}

function parametros(e: Diodo): Parametros {
  return {
    is: e.corrienteSaturacion_a ?? IS_POR_DEFECTO_A,
    nVt: (e.coeficienteEmision ?? N_POR_DEFECTO) * VOLTAJE_TERMICO_V,
    bv: e.ruptura_v,
    ibv: e.corrienteRuptura_a ?? IBV_POR_DEFECTO_A,
  };
}

/**
 * Corriente y conductancia (pendiente dI/dV) del diodo en el voltaje v.
 *   directa:  Is · (e^(v/nVt) − 1)
 *   ruptura:  −Ibv · (e^(−(v + BV)/nVt) − e^(−BV/nVt))   (el segundo término deja I(0) = 0 exacto)
 *   gmin:     gmin · v   (una conductancia diminuta que ayuda a converger)
 */
export function evaluarDiodo(e: Diodo, v: number, gmin_s: number): { corriente_a: number; conductancia_s: number } {
  const p = parametros(e);
  const expDirecta = Math.exp(v / p.nVt);
  let corriente_a = p.is * (expDirecta - 1) + gmin_s * v;
  let conductancia_s = (p.is / p.nVt) * expDirecta + gmin_s;
  if (p.bv !== undefined) {
    const expRuptura = Math.exp(-(v + p.bv) / p.nVt);
    corriente_a -= p.ibv * (expRuptura - Math.exp(-p.bv / p.nVt));
    conductancia_s += (p.ibv / p.nVt) * expRuptura;
  }
  return { corriente_a, conductancia_s };
}

/**
 * Limita cuánto puede crecer el voltaje de una unión en una iteración.
 *
 * Por qué: la corriente crece como e^(v/nVt). Si Newton-Raphson propone saltar
 * de 0.6 V a 5 V, e^(5/0.026) es un número astronómico y el cálculo se dispara.
 * Por encima del "voltaje crítico" (donde la curva empieza a subir fuerte), en
 * vez de mover el voltaje, se mueve la corriente de forma razonable: el nuevo
 * voltaje es el que daría la corriente que predice la recta tangente. Eso
 * equivale a avanzar con un logaritmo en lugar de en línea recta.
 *
 * @param s Escala de la exponencial (n·Vt).
 */
export function limitarUnion(vNuevo: number, vAnterior: number, s: number, vCritico: number): number {
  if (vNuevo <= vCritico || Math.abs(vNuevo - vAnterior) <= 2 * s) return vNuevo;
  if (vAnterior > 0) {
    // Recta tangente en vAnterior: I ∝ e^(vAnterior/s) · (1 + Δv/s). El voltaje que da esa corriente es
    // vAnterior + s·ln(1 + Δv/s).
    const argumento = 1 + (vNuevo - vAnterior) / s;
    return argumento > 0 ? vAnterior + s * Math.log(argumento) : vCritico;
  }
  // Venía de inversa o de cero: se acerca con un logaritmo.
  return s * Math.log(vNuevo / s);
}

function voltajeCritico(s: number, corriente_a: number): number {
  return s * Math.log(s / (Math.SQRT2 * corriente_a));
}

/**
 * Diodo. En cada iteración se reemplaza la curva por su recta tangente en vd:
 *   I ≈ I(vd) + G·(v − vd)  =  G·v + Ieq,   con G = dI/dV y Ieq = I(vd) − G·vd.
 * G se estampa como una resistencia y Ieq como una fuente de corriente.
 */
export const primitivaDiodo: Primitiva<Diodo, EstadoDiodo> = {
  conexionDC: 'conduce',
  variablesExtra: 0,
  noLineal: true,
  terminales: (e) => [e.anodo, e.catodo],
  terminalesControl: () => [],
  validar: (e) => [
    ...exigirPositivoOpcional(e.corrienteSaturacion_a, 'La corriente de saturación', 'A'),
    ...exigirPositivoOpcional(e.coeficienteEmision, 'El coeficiente de emisión', ''),
    ...exigirPositivoOpcional(e.ruptura_v, 'El voltaje de ruptura', 'V'),
    ...exigirPositivoOpcional(e.corrienteRuptura_a, 'La corriente de ruptura', 'A'),
  ],
  crearEstado: () => ({ vd: 0 }),
  estampar(e, est, ctx, _extra, estado) {
    const p = parametros(e);
    const vNuevo = ctx.voltaje(e.anodo) - ctx.voltaje(e.catodo);
    let vd: number;
    if (p.bv !== undefined && vNuevo < -p.bv / 2) {
      // Zona de ruptura: la misma idea, mirando el voltaje "más allá" de −BV.
      const y = limitarUnion(-vNuevo - p.bv, -estado.vd - p.bv, p.nVt, voltajeCritico(p.nVt, p.ibv));
      vd = -y - p.bv;
    } else {
      vd = limitarUnion(vNuevo, estado.vd, p.nVt, voltajeCritico(p.nVt, p.is));
    }
    if (vd !== vNuevo) ctx.avisarLimitado();
    estado.vd = vd;

    const { corriente_a, conductancia_s } = evaluarDiodo(e, vd, ctx.gmin_s);
    const ieq = corriente_a - conductancia_s * vd;
    const a = est.indiceNodo(e.anodo);
    const k = est.indiceNodo(e.catodo);
    est.sumarA(a, a, conductancia_s);
    est.sumarA(a, k, -conductancia_s);
    est.sumarA(k, a, -conductancia_s);
    est.sumarA(k, k, conductancia_s);
    est.sumarZ(a, -ieq);
    est.sumarZ(k, ieq);
  },
  corriente: (e, ctx) => evaluarDiodo(e, ctx.voltaje(e.anodo) - ctx.voltaje(e.catodo), ctx.gmin_s).corriente_a,
};
