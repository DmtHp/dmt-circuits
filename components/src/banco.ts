/**
 * Banco de pruebas: herramientas para montar el componente en un circuito de
 * prueba, simularlo con el motor y medir.
 */

import {
  analizarDC,
  analizarTransitorio,
  type Elemento,
  type OpcionesTransitorio,
  type ResultadoDC,
  type ResultadoTransitorio,
} from '../../engine/src';
import { construir } from './construir';
import type { Componente } from './formato';

/** Nombre de la instancia del componente dentro de los circuitos de prueba. */
export const DUT = 'DUT';

export function montar(componente: Componente, conexiones: Record<string, string>, fijos: Elemento[]): Elemento[] {
  return [...fijos, ...construir(componente, DUT, conexiones).elementos];
}

export function simularDC(componente: Componente, conexiones: Record<string, string>, fijos: Elemento[]): ResultadoDC {
  return analizarDC({ elementos: montar(componente, conexiones, fijos) });
}

export function simularTransitorio(
  componente: Componente,
  conexiones: Record<string, string>,
  fijos: Elemento[],
  opciones: OpcionesTransitorio,
): ResultadoTransitorio {
  return analizarTransitorio({ elementos: montar(componente, conexiones, fijos) }, opciones);
}

export function voltaje(r: ResultadoDC, nodo: string): number {
  const v = r.voltajes.get(nodo);
  if (v === undefined) throw new Error(`No hay voltaje para el nodo ${nodo}.`);
  return v;
}

export function corriente(r: ResultadoDC, elemento: string): number {
  const m = r.elementos.get(elemento);
  if (!m) throw new Error(`No hay medidas para ${elemento}.`);
  return m.corriente_a;
}

/**
 * Primer instante (desde `desde`) en que la serie cruza `nivel`, interpolando
 * entre los dos puntos vecinos. null si no lo cruza.
 */
export function cruce(tiempos: number[], serie: number[], nivel: number, desde = 0): number | null {
  for (let k = 1; k < serie.length; k++) {
    if (tiempos[k]! < desde) continue;
    const a = serie[k - 1]!;
    const b = serie[k]!;
    if ((a - nivel) * (b - nivel) <= 0 && a !== b) {
      const t0 = tiempos[k - 1]!;
      const t1 = tiempos[k]!;
      return t0 + ((t1 - t0) * (nivel - a)) / (b - a);
    }
  }
  return null;
}

/** Mensaje corto de un error inesperado, para mostrarlo en el resultado de una prueba. */
export function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
