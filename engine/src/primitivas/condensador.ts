import type { Condensador } from '../circuito';
import { exigirPositivo, type Contexto, type Primitiva } from './primitiva';

interface EstadoCondensador {
  /** Voltaje y corriente en el último paso aceptado. */
  v: number;
  i: number;
}

/**
 * Modelo compañero: en cada paso de tiempo h, el condensador se reemplaza por
 * una conductancia G en paralelo con una fuente de corriente que "recuerda"
 * el paso anterior. Así el paso es un problema DC normal.
 *
 * Euler hacia atrás: la derivada se aproxima con el paso anterior,
 *   i = C · (v − v_ant) / h   →   G = C/h,   i = G·v − G·v_ant
 *
 * Trapezoidal: se promedian las derivadas del inicio y del final del paso,
 *   (i + i_ant)/2 = C · (v − v_ant)/h   →   G = 2C/h,   i = G·v − (G·v_ant + i_ant)
 * Es más precisa (el error baja con h² en vez de h).
 */
function compania(e: Condensador, ctx: Contexto, estado: EstadoCondensador): { g: number; fuente: number } {
  if (ctx.metodo === 'euler') {
    const g = e.capacitancia_f / ctx.paso_s;
    return { g, fuente: g * estado.v };
  }
  const g = (2 * e.capacitancia_f) / ctx.paso_s;
  return { g, fuente: g * estado.v + estado.i };
}

/**
 * Condensador: I = C · dV/dt.
 * En DC (voltaje constante) la corriente es 0: es un circuito abierto y no estampa nada.
 */
export const primitivaCondensador: Primitiva<Condensador, EstadoCondensador> = {
  conexionDC: 'abierto',
  conexionTransitorio: 'conduce',
  variablesExtra: 0,
  terminales: (e) => [e.a, e.b],
  terminalesControl: () => [],
  validar: (e) => [
    ...exigirPositivo(e.capacitancia_f, 'La capacitancia', 'F'),
    ...(e.voltajeInicial_v === undefined || Number.isFinite(e.voltajeInicial_v)
      ? []
      : [`El voltaje inicial debe ser un número finito (recibí ${e.voltajeInicial_v}).`]),
  ],
  crearEstado: () => ({ v: 0, i: 0 }),
  estampar(e, est, ctx, _extra, estado) {
    if (ctx.modo === 'dc') return;
    const { g, fuente } = compania(e, ctx, estado);
    const a = est.indiceNodo(e.a);
    const b = est.indiceNodo(e.b);
    est.sumarA(a, a, g);
    est.sumarA(a, b, -g);
    est.sumarA(b, a, -g);
    est.sumarA(b, b, g);
    // i = G·v − fuente: la parte constante pasa al lado derecho.
    est.sumarZ(a, fuente);
    est.sumarZ(b, -fuente);
  },
  corriente(e, ctx, _extra, estado) {
    if (ctx.modo === 'dc') return 0;
    const { g, fuente } = compania(e, ctx, estado);
    return g * (ctx.voltaje(e.a) - ctx.voltaje(e.b)) - fuente;
  },
  iniciarTransitorio(e, estado, medida, usarCondicionesIniciales) {
    estado.v = usarCondicionesIniciales ? (e.voltajeInicial_v ?? 0) : medida.voltaje_v;
    estado.i = 0;
  },
  aceptarPaso(_e, estado, medida) {
    estado.v = medida.voltaje_v;
    estado.i = medida.corriente_a;
  },
};
