import type { Categoria } from '../formato';
import { categoriaCompuerta } from './compuerta';
import { categoriaDiodo } from './diodo';
import { categoriaOpamp } from './opamp';
import { categoriaPasivo } from './pasivo';
import type { DefinicionCategoria } from './tipos';

export const CATEGORIAS_DEFINIDAS: Record<Categoria, DefinicionCategoria> = {
  pasivo: categoriaPasivo,
  diodo: categoriaDiodo,
  amplificador_operacional: categoriaOpamp,
  compuerta_logica: categoriaCompuerta,
};

export function obtenerCategoria(categoria: Categoria): DefinicionCategoria {
  return CATEGORIAS_DEFINIDAS[categoria];
}

export type { DefinicionCategoria, DefinicionPrueba, Plantilla, ResultadoPrueba, EstadoPrueba } from './tipos';
