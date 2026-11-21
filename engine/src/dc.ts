/**
 * Análisis DC (punto de operación) con análisis nodal modificado (MNA).
 *
 * En DC el condensador es un circuito abierto y la bobina un cortocircuito.
 * Si el circuito es lineal se resuelve en una sola vuelta; si tiene diodos o
 * limitadores, se itera con Newton-Raphson (ver newton.ts).
 */

import type { Circuito, Nodo } from './circuito';
import { GMIN_S, OPCIONES_NEWTON, resolverPuntoOperacion, type Estrategia, type OpcionesNewton } from './newton';
import { medir, prepararSistema, type MedidaElemento, type ParametrosAnalisis } from './sistema';

export type { MedidaElemento } from './sistema';

export interface ResultadoDC {
  /** Voltaje de cada nodo respecto a tierra. Incluye la tierra ("0" → 0 V). */
  voltajes: ReadonlyMap<Nodo, number>;
  /** Medidas de cada elemento, por nombre. */
  elementos: ReadonlyMap<string, MedidaElemento>;
  /** Cantidad de incógnitas del sistema A · x = z. */
  incognitas: number;
  /** Iteraciones de Newton-Raphson en total (1 si el circuito es lineal). */
  iteraciones: number;
  /** Qué estrategia encontró la solución. */
  estrategia: Estrategia;
}

export function analizarDC(circuito: Circuito, opciones: Partial<OpcionesNewton> = {}): ResultadoDC {
  const sistema = prepararSistema(circuito, 'dc');
  const parametros: ParametrosAnalisis = {
    modo: 'dc',
    tiempo_s: 0,
    paso_s: 0,
    metodo: 'euler',
    factorFuentes: 1,
    usarFormas: false,
    gmin_s: GMIN_S,
    gminNodos_s: 0,
  };
  const { x, iteraciones, estrategia } = resolverPuntoOperacion(sistema, parametros, undefined, {
    ...OPCIONES_NEWTON,
    ...opciones,
  });
  const { voltajes, elementos } = medir(sistema, parametros, x);
  return { voltajes, elementos, incognitas: sistema.n, iteraciones, estrategia };
}
