import type { Resistencia } from '../circuito';
import { exigirPositivo, type Primitiva } from './primitiva';

/**
 * Resistencia: I = (Va − Vb) / R = G · (Va − Vb), con G = 1/R (conductancia, en siemens).
 *
 * Estampa (ley de corrientes de Kirchhoff, corriente que sale de cada nodo):
 *            col a   col b
 *   fila a   +G      −G
 *   fila b   −G      +G
 */
export const primitivaResistencia: Primitiva<Resistencia> = {
  conexionDC: 'conduce',
  variablesExtra: 0,
  terminales: (e) => [e.a, e.b],
  terminalesControl: () => [],
  validar: (e) => exigirPositivo(e.resistencia_ohm, 'La resistencia', 'Ω'),
  estampar(e, est) {
    const g = 1 / e.resistencia_ohm;
    const a = est.indiceNodo(e.a);
    const b = est.indiceNodo(e.b);
    est.sumarA(a, a, g);
    est.sumarA(a, b, -g);
    est.sumarA(b, a, -g);
    est.sumarA(b, b, g);
  },
  corriente: (e, v) => (v(e.a) - v(e.b)) / e.resistencia_ohm,
};
