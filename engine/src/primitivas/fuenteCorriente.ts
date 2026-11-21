import type { FuenteCorriente } from '../circuito';
import { exigirFinito, type Primitiva } from './primitiva';

/**
 * Fuente de corriente ideal: I fija, circula por dentro de `desde` a `hacia`.
 * No agrega incógnitas: solo mueve corriente conocida al lado derecho z.
 * Saca I del nodo `desde` y la mete en el nodo `hacia`:
 *   z[desde] −= I,   z[hacia] += I
 */
export const primitivaFuenteCorriente: Primitiva<FuenteCorriente> = {
  conexionDC: 'abierto',
  variablesExtra: 0,
  terminales: (e) => [e.desde, e.hacia],
  terminalesControl: () => [],
  validar: (e) => exigirFinito(e.corriente_a, 'La corriente'),
  estampar(e, est, ctx) {
    const i = e.corriente_a * ctx.factorFuentes;
    est.sumarZ(est.indiceNodo(e.desde), -i);
    est.sumarZ(est.indiceNodo(e.hacia), i);
  },
  corriente: (e, ctx) => e.corriente_a * ctx.factorFuentes,
};
