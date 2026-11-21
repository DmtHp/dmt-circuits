import type { Bobina } from '../circuito';
import { exigirPositivo, type Primitiva } from './primitiva';

interface EstadoBobina {
  /** Corriente y voltaje en el último paso aceptado. */
  i: number;
  v: number;
}

/**
 * Bobina: V = L · dI/dt. Su corriente es una incógnita extra (como en una
 * fuente de voltaje), así se mide directamente.
 *
 * En DC (corriente constante) V = 0: es un cortocircuito.
 *   fila I:  Va − Vb = 0
 *
 * En un paso de tiempo h (modelo compañero, el dual del condensador):
 *   Euler hacia atrás:  v = L·(i − i_ant)/h           →  Va − Vb − (L/h)·i  = −(L/h)·i_ant
 *   Trapezoidal:        (v + v_ant)/2 = L·(i − i_ant)/h →  Va − Vb − (2L/h)·i = −(2L/h)·i_ant − v_ant
 */
export const primitivaBobina: Primitiva<Bobina, EstadoBobina> = {
  conexionDC: 'fijaVoltaje',
  conexionTransitorio: 'conduce',
  variablesExtra: 1,
  terminales: (e) => [e.a, e.b],
  terminalesControl: () => [],
  validar: (e) => [
    ...exigirPositivo(e.inductancia_h, 'La inductancia', 'H'),
    ...(e.corrienteInicial_a === undefined || Number.isFinite(e.corrienteInicial_a)
      ? []
      : [`La corriente inicial debe ser un número finito (recibí ${e.corrienteInicial_a}).`]),
  ],
  crearEstado: () => ({ i: 0, v: 0 }),
  estampar(e, est, ctx, extra, estado) {
    const a = est.indiceNodo(e.a);
    const b = est.indiceNodo(e.b);
    est.sumarA(a, extra, 1);
    est.sumarA(b, extra, -1);
    est.sumarA(extra, a, 1);
    est.sumarA(extra, b, -1);
    if (ctx.modo === 'dc') return;
    if (ctx.metodo === 'euler') {
      const r = e.inductancia_h / ctx.paso_s;
      est.sumarA(extra, extra, -r);
      est.sumarZ(extra, -r * estado.i);
    } else {
      const r = (2 * e.inductancia_h) / ctx.paso_s;
      est.sumarA(extra, extra, -r);
      est.sumarZ(extra, -r * estado.i - estado.v);
    }
  },
  corriente: (_e, ctx, extra) => ctx.valorExtra(extra),
  iniciarTransitorio(e, estado, medida, usarCondicionesIniciales) {
    estado.i = usarCondicionesIniciales ? (e.corrienteInicial_a ?? 0) : medida.corriente_a;
    estado.v = usarCondicionesIniciales ? 0 : medida.voltaje_v;
  },
  aceptarPaso(_e, estado, medida) {
    estado.i = medida.corriente_a;
    estado.v = medida.voltaje_v;
  },
};
