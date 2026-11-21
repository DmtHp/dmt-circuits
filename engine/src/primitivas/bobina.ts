import type { Bobina } from '../circuito';
import { exigirPositivo, type Primitiva } from './primitiva';

/**
 * Bobina en DC. Con corriente continua, V = L · dI/dt = 0: es un cortocircuito.
 * Se estampa como una fuente de voltaje de 0 V, así su corriente queda como
 * incógnita y se puede medir. (Su comportamiento en el tiempo llega con el
 * análisis transitorio.)
 */
export const primitivaBobina: Primitiva<Bobina> = {
  conexionDC: 'fijaVoltaje',
  variablesExtra: 1,
  terminales: (e) => [e.a, e.b],
  terminalesControl: () => [],
  validar: (e) => exigirPositivo(e.inductancia_h, 'La inductancia', 'H'),
  estampar(e, est, _ctx, extra) {
    const a = est.indiceNodo(e.a);
    const b = est.indiceNodo(e.b);
    est.sumarA(a, extra, 1);
    est.sumarA(b, extra, -1);
    est.sumarA(extra, a, 1);
    est.sumarA(extra, b, -1);
  },
  corriente: (_e, ctx, extra) => ctx.valorExtra(extra),
};
