/** Funciones compartidas por las pruebas de todas las categorías. */

import { mensajeDe } from '../banco';
import type { Prueba } from '../formato';
import { formatear, type ResultadoPrueba } from './tipos';

function conFuente(prueba: Prueba): { fuente?: string } {
  return prueba.fuente ? { fuente: prueba.fuente } : {};
}

/** Pasa si |obtenido − esperado| ≤ tolerancia % de esperado. */
export function compararPorcentaje(
  prueba: Prueba,
  descripcion: string,
  esperado: number,
  obtenido: number,
  toleranciaPct: number,
  unidad: string,
): ResultadoPrueba {
  const pasa = Math.abs(obtenido - esperado) <= (Math.abs(esperado) * toleranciaPct) / 100;
  return {
    tipo: prueba.tipo,
    descripcion,
    estado: pasa ? 'pasa' : 'no_pasa',
    esperado: `${formatear(esperado, unidad)} ± ${toleranciaPct} %`,
    obtenido: formatear(obtenido, unidad),
    ...conFuente(prueba),
  };
}

/** Pasa si |obtenido − esperado| ≤ tolerancia (en la misma unidad). */
export function compararAbsoluto(
  prueba: Prueba,
  descripcion: string,
  esperado: number,
  obtenido: number,
  tolerancia: number,
  unidad: string,
): ResultadoPrueba {
  const pasa = Math.abs(obtenido - esperado) <= tolerancia;
  return {
    tipo: prueba.tipo,
    descripcion,
    estado: pasa ? 'pasa' : 'no_pasa',
    esperado: `${formatear(esperado, unidad)} ± ${formatear(tolerancia, unidad)}`,
    obtenido: formatear(obtenido, unidad),
    ...conFuente(prueba),
  };
}

/**
 * Compara con un rango del datasheet: mínimo y/o máximo, o un típico con
 * tolerancia en % si no hay límites.
 */
export function compararRango(
  prueba: Prueba,
  descripcion: string,
  limites: { minimo?: number; maximo?: number; tipico?: number; toleranciaPct?: number },
  obtenido: number,
  unidad: string,
): ResultadoPrueba {
  let { minimo, maximo } = limites;
  if (minimo === undefined && maximo === undefined && limites.tipico !== undefined) {
    const margen = (Math.abs(limites.tipico) * (limites.toleranciaPct ?? 10)) / 100;
    minimo = limites.tipico - margen;
    maximo = limites.tipico + margen;
  }
  const pasa = (minimo === undefined || obtenido >= minimo) && (maximo === undefined || obtenido <= maximo);
  const partes: string[] = [];
  if (minimo !== undefined) partes.push(`≥ ${formatear(minimo, unidad)}`);
  if (maximo !== undefined) partes.push(`≤ ${formatear(maximo, unidad)}`);
  return {
    tipo: prueba.tipo,
    descripcion,
    estado: pasa ? 'pasa' : 'no_pasa',
    esperado: partes.join(' y '),
    obtenido: formatear(obtenido, unidad),
    ...conFuente(prueba),
  };
}

/** La prueba no se pudo completar (por ejemplo, la simulación no convergió). */
export function fallaPrueba(prueba: Prueba, descripcion: string, error: unknown): ResultadoPrueba {
  return { tipo: prueba.tipo, descripcion, estado: 'error', esperado: '-', obtenido: mensajeDe(error), ...conFuente(prueba) };
}

/** Exige al menos uno de los campos de un rango. */
export function exigirAlgunLimite(prueba: Prueba, campos: string[]): string[] {
  return campos.some((c) => prueba[c] !== undefined) ? [] : [`Indica al menos uno de estos campos: ${campos.join(', ')}.`];
}

/** Revisa que mínimo ≤ máximo. */
export function revisarOrden(prueba: Prueba, campoMinimo: string, campoMaximo: string): string[] {
  const min = prueba[campoMinimo];
  const max = prueba[campoMaximo];
  return typeof min === 'number' && typeof max === 'number' && min > max ? [`${campoMinimo} (${min}) es mayor que ${campoMaximo} (${max}).`] : [];
}
