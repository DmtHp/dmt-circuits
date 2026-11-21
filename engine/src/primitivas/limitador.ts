import type { Limitador } from '../circuito';
import { exigirFinito, exigirPositivoOpcional, type Primitiva } from './primitiva';

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

function suavidad(e: Limitador): number {
  return e.suavidad_v ?? (e.maximo_v - e.minimo_v) / 100;
}

/**
 * La curva del limitador y su pendiente:
 *   f(u) = u − s·ln(1 + e^((u − máx)/s)) + s·ln(1 + e^((mín − u)/s))
 *
 * Lejos de los topes los dos logaritmos son casi 0 y f(u) ≈ u (copia la entrada).
 * Muy por encima del máximo, el primer término se come el exceso y f(u) → máx.
 * Muy por debajo del mínimo, el segundo lo compensa y f(u) → mín.
 * s controla qué tan redondeada es la esquina.
 */
export function curvaLimitador(e: Limitador, u: number): { salida_v: number; pendiente: number } {
  const s = suavidad(e);
  const arriba = (u - e.maximo_v) / s;
  const abajo = (e.minimo_v - u) / s;
  return {
    salida_v: u - s * softplus(arriba) + s * softplus(abajo),
    pendiente: 1 - sigmoide(arriba) - sigmoide(abajo),
  };
}

/** Cuántas "suavidades" más allá del tope empieza la zona saturada. */
const MARGEN_SATURACION = 5;

/**
 * Limitador suave (fuente de voltaje controlada no lineal):
 *   V+ − V− = f(u),   u = ganancia · (Vc+ − Vc−)
 *
 * Linealizado en u0 (recta tangente):
 *   V+ − V− − f'(u0)·ganancia·(Vc+ − Vc−) = f(u0) − f'(u0)·u0
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
  terminalesControl: (e) => [e.controlPositivo, e.controlNegativo],
  validar: (e) => {
    const problemas = [
      ...exigirFinito(e.ganancia, 'La ganancia'),
      ...exigirFinito(e.minimo_v, 'El mínimo'),
      ...exigirFinito(e.maximo_v, 'El máximo'),
      ...exigirPositivoOpcional(e.suavidad_v, 'La suavidad', 'V'),
    ];
    if (problemas.length === 0 && !(e.maximo_v > e.minimo_v)) {
      problemas.push(`El máximo (${e.maximo_v} V) debe ser mayor que el mínimo (${e.minimo_v} V).`);
    }
    return problemas;
  },
  crearEstado: (e) => ({ u: Math.min(Math.max(0, e.minimo_v), e.maximo_v) }),
  estampar(e, est, ctx, extra, estado) {
    const s = suavidad(e);
    const bordeAlto = e.maximo_v + MARGEN_SATURACION * s;
    const bordeBajo = e.minimo_v - MARGEN_SATURACION * s;
    const uNuevo = e.ganancia * (ctx.voltaje(e.controlPositivo) - ctx.voltaje(e.controlNegativo));
    let u = uNuevo;
    if (uNuevo >= bordeAlto && estado.u < bordeAlto) u = bordeAlto;
    else if (uNuevo <= bordeBajo && estado.u > bordeBajo) u = bordeBajo;
    if (u !== uNuevo) ctx.avisarLimitado();
    estado.u = u;

    const { salida_v, pendiente } = curvaLimitador(e, u);
    const k = pendiente * e.ganancia;
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
    est.sumarZ(extra, salida_v - pendiente * u);
  },
  corriente: (_e, ctx, extra) => ctx.valorExtra(extra),
};
