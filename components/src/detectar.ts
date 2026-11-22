/**
 * Detección de categoría para archivos que no la declaran (o la declaran mal).
 *
 * Se suman pistas: las plantillas y las pruebas que usa el archivo son pistas
 * fuertes (pertenecen a una sola categoría); los nombres de los pines son
 * pistas débiles. Si una categoría gana con claridad, se usa; si no, se
 * devuelven las candidatas para que la interfaz pregunte.
 */

import { CATEGORIAS_DEFINIDAS } from './categorias';
import { esObjeto } from './esquema';
import { CATEGORIAS, type Categoria } from './formato';

export interface Deteccion {
  /** La categoría elegida, o null si no hay una clara. */
  categoria: Categoria | null;
  /** Categorías posibles, de más a menos probable. */
  candidatas: Categoria[];
  /** Por qué se eligió, en palabras. */
  razon: string;
}

const FUERTE = 10;
const DEBIL = 2;

export function detectarCategoria(dato: unknown): Deteccion {
  const puntos = new Map<Categoria, number>(CATEGORIAS.map((c) => [c, 0]));
  const razones = new Map<Categoria, string[]>(CATEGORIAS.map((c) => [c, []]));
  const sumar = (c: Categoria, n: number, razon: string): void => {
    puntos.set(c, puntos.get(c)! + n);
    razones.get(c)!.push(razon);
  };
  if (!esObjeto(dato)) return { categoria: null, candidatas: [], razon: 'El archivo no es un objeto JSON.' };

  const modelo = esObjeto(dato.modelo) ? dato.modelo : {};
  if (modelo.tipo === 'logico') sumar('compuerta_logica', FUERTE, 'el modelo es lógico');

  const bloques = Array.isArray(modelo.bloques) ? modelo.bloques : [];
  for (const b of bloques) {
    if (!esObjeto(b) || typeof b.usa !== 'string') continue;
    for (const def of Object.values(CATEGORIAS_DEFINIDAS)) {
      if (b.usa in def.plantillas) sumar(def.categoria, FUERTE, `usa la plantilla ${b.usa}`);
    }
  }

  const pruebas = Array.isArray(dato.pruebas) ? dato.pruebas : [];
  for (const p of pruebas) {
    if (!esObjeto(p) || typeof p.tipo !== 'string') continue;
    for (const def of Object.values(CATEGORIAS_DEFINIDAS)) {
      if (p.tipo in def.pruebas) sumar(def.categoria, FUERTE / 2, `tiene una prueba de ${p.tipo}`);
    }
  }

  const pines = Array.isArray(dato.pines) ? dato.pines.filter(esObjeto).map((p) => String(p.nombre ?? '').toUpperCase()) : [];
  if (pines.some((n) => /IN\d*[+-]|[+-]IN\d*|INV/.test(n)) && pines.some((n) => n.includes('OUT'))) {
    sumar('amplificador_operacional', DEBIL * 2, 'tiene pines de entrada inversora/no inversora y salida');
  }
  if (pines.length >= 2 && pines.length <= 3 && pines.some((n) => /^(A|K|ANODO|CATODO|ANODE|CATHODE)$/.test(n))) {
    sumar('diodo', DEBIL * 2, 'tiene pines de ánodo y cátodo');
  }
  if (pines.length >= 2 && pines.length <= 3 && pines.every((n) => /^(A|B|W|1|2|3)$/.test(n))) {
    sumar('pasivo', DEBIL, 'tiene 2 o 3 pines genéricos');
  }
  if (pines.includes('VCC') && pines.includes('GND') && pines.some((n) => /^\d*Y\d*$/.test(n))) {
    sumar('compuerta_logica', DEBIL * 2, 'tiene pines de salida Y y alimentación VCC/GND');
  }

  const candidatas = CATEGORIAS.filter((c) => puntos.get(c)! > 0).sort((a, b) => puntos.get(b)! - puntos.get(a)!);
  if (candidatas.length === 0) return { categoria: null, candidatas: [], razon: 'No encontré pistas de ninguna categoría.' };
  const [primera, segunda] = candidatas;
  const clara = puntos.get(primera!)! >= DEBIL * 2 && (segunda === undefined || puntos.get(primera!)! >= 2 * puntos.get(segunda)!);
  return {
    categoria: clara ? primera! : null,
    candidatas,
    razon: razones.get(primera!)!.join(', '),
  };
}
