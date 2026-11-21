import type { FuenteCorrienteControlada } from '../circuito';
import { exigirFinito, type Primitiva } from './primitiva';

/**
 * Fuente de corriente controlada por voltaje (VCCS): I = gm · (Vc+ − Vc−),
 * circulando por dentro de `desde` a `hacia`. Es como una resistencia "cruzada":
 * la corriente en un par de nodos depende del voltaje en otro par.
 *
 *              col c+   col c−
 *   fila desde  +gm      −gm
 *   fila hacia  −gm      +gm
 *
 * Es el modelo básico de un transistor en pequeña señal.
 */
export const primitivaVCCS: Primitiva<FuenteCorrienteControlada> = {
  conexionDC: 'abierto',
  variablesExtra: 0,
  terminales: (e) => [e.desde, e.hacia],
  terminalesControl: (e) => [e.controlPositivo, e.controlNegativo],
  validar: (e) => exigirFinito(e.transconductancia_s, 'La transconductancia'),
  estampar(e, est) {
    const gm = e.transconductancia_s;
    const d = est.indiceNodo(e.desde);
    const h = est.indiceNodo(e.hacia);
    const cp = est.indiceNodo(e.controlPositivo);
    const cn = est.indiceNodo(e.controlNegativo);
    est.sumarA(d, cp, gm);
    est.sumarA(d, cn, -gm);
    est.sumarA(h, cp, -gm);
    est.sumarA(h, cn, gm);
  },
  corriente: (e, ctx) => e.transconductancia_s * (ctx.voltaje(e.controlPositivo) - ctx.voltaje(e.controlNegativo)),
};
