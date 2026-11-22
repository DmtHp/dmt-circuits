/**
 * El kit básico: los componentes de components/biblioteca/*.json.
 *
 * Vite junta los archivos al compilar (import.meta.glob), así la biblioteca
 * funciona igual en la app publicada y en las pruebas.
 */

import type { Componente } from './formato';

const archivos = import.meta.glob('../biblioteca/*.json', { eager: true, import: 'default' });

/** Contenido de cada archivo, por nombre de archivo ("lm358.json"). */
export function archivosBiblioteca(): Map<string, unknown> {
  return new Map(Object.entries(archivos).map(([ruta, contenido]) => [ruta.split('/').pop()!, contenido]));
}

/**
 * Componentes del kit, por id. Se suponen válidos: las pruebas del proyecto
 * pasan cada archivo por validarComponente.
 */
export const BIBLIOTECA: ReadonlyMap<string, Componente> = new Map(
  [...archivosBiblioteca().values()].map((c) => [(c as Componente).id, c as Componente]),
);
