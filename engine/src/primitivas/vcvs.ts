import type { FuenteVoltajeControlada } from '../circuito';
import { exigirFinito, type Primitiva } from './primitiva';

/**
 * Fuente de voltaje controlada por voltaje (VCVS): V+ − V− = μ · (Vc+ − Vc−).
 * Es como una fuente de voltaje (incógnita extra I), pero su ecuación
 * compara la salida con la entrada de control:
 *   V+ − V− − μ·Vc+ + μ·Vc− = 0
 *
 *            col +   col −   col c+   col c−   col I
 *   fila +                                     +1
 *   fila −                                     −1
 *   fila I   +1      −1      −μ       +μ
 *
 * Con μ muy grande es el modelo más simple de un amplificador operacional.
 */
export const primitivaVCVS: Primitiva<FuenteVoltajeControlada> = {
  conexionDC: 'fijaVoltaje',
  variablesExtra: 1,
  terminales: (e) => [e.positivo, e.negativo],
  terminalesControl: (e) => [e.controlPositivo, e.controlNegativo],
  validar: (e) => exigirFinito(e.ganancia, 'La ganancia'),
  estampar(e, est, extra) {
    const p = est.indiceNodo(e.positivo);
    const n = est.indiceNodo(e.negativo);
    const cp = est.indiceNodo(e.controlPositivo);
    const cn = est.indiceNodo(e.controlNegativo);
    est.sumarA(p, extra, 1);
    est.sumarA(n, extra, -1);
    est.sumarA(extra, p, 1);
    est.sumarA(extra, n, -1);
    est.sumarA(extra, cp, -e.ganancia);
    est.sumarA(extra, cn, e.ganancia);
  },
  corriente: (_e, _v, valorExtra) => valorExtra,
};
