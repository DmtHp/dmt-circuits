import type { FuenteVoltaje } from '../circuito';
import { exigirFinito, type Primitiva } from './primitiva';

/**
 * Fuente de voltaje ideal. Su corriente no depende del voltaje (puede ser
 * cualquiera), así que el MNA la agrega como incógnita extra I y suma una
 * ecuación: V+ − V− = E.
 *
 *            col +   col −   col I        z
 *   fila +                   +1
 *   fila −                   −1
 *   fila I   +1      −1                   E
 *
 * I es la corriente que entra por + y sale por − (por dentro de la fuente).
 * Una pila que alimenta un circuito da I negativa: la corriente sale por su +.
 */
export const primitivaFuenteVoltaje: Primitiva<FuenteVoltaje> = {
  conexionDC: 'fijaVoltaje',
  variablesExtra: 1,
  terminales: (e) => [e.positivo, e.negativo],
  terminalesControl: () => [],
  validar: (e) => exigirFinito(e.voltaje_v, 'El voltaje'),
  estampar(e, est, extra) {
    const p = est.indiceNodo(e.positivo);
    const n = est.indiceNodo(e.negativo);
    est.sumarA(p, extra, 1);
    est.sumarA(n, extra, -1);
    est.sumarA(extra, p, 1);
    est.sumarA(extra, n, -1);
    est.sumarZ(extra, e.voltaje_v);
  },
  corriente: (_e, _v, valorExtra) => valorExtra,
};
