import type { Condensador } from '../circuito';
import { exigirPositivo, type Primitiva } from './primitiva';

/**
 * Condensador en DC. Con voltaje constante, I = C · dV/dt = 0: es un circuito
 * abierto y no estampa nada. (Su comportamiento en el tiempo llega con el
 * análisis transitorio.)
 */
export const primitivaCondensador: Primitiva<Condensador> = {
  conexionDC: 'abierto',
  variablesExtra: 0,
  terminales: (e) => [e.a, e.b],
  terminalesControl: () => [],
  validar: (e) => exigirPositivo(e.capacitancia_f, 'La capacitancia', 'F'),
  estampar() {},
  corriente: () => 0,
};
