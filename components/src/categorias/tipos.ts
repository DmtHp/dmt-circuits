/**
 * Lo que define una categoría: sus reglas (filtro 2), sus plantillas de
 * modelo eléctrico y sus pruebas (filtro 3).
 */

import type { Elemento } from '../../../engine/src';
import type { ErrorValidacion } from '../esquema';
import type { Categoria, Componente, Prueba } from '../formato';

export interface DefParametro {
  unidad: string;
  descripcion: string;
  /** Si falta y no hay defecto, el parámetro es obligatorio (salvo que sea opcional). */
  defecto?: number;
  /** true si puede faltar sin defecto (su ausencia significa algo, como "no rompe en inversa"). */
  opcional?: boolean;
  minimo?: number;
  maximo?: number;
}

/**
 * Una plantilla de modelo: un bloque que la categoría sabe armar con
 * primitivas del motor, a partir de unos pocos parámetros del datasheet.
 */
export interface Plantilla {
  descripcion: string;
  /** Nombres de los terminales, en el orden en que el bloque los conecta. */
  terminales: string[];
  parametros: Record<string, DefParametro>;
  /**
   * Elementos del motor. `prefijo` hace únicos los nombres internos;
   * `nodos[i]` es el nodo del circuito conectado al terminal i.
   */
  construir(prefijo: string, nodos: string[], parametros: Record<string, number>): Elemento[];
}

export type TipoCampoPrueba =
  | { tipo: 'numero'; minimo?: number; maximo?: number }
  | { tipo: 'numeroOExpresion' }
  | { tipo: 'opcion'; valores: string[] }
  | { tipo: 'pines'; cantidad: number }
  | { tipo: 'filas' };

export interface DefCampoPrueba {
  descripcion: string;
  unidad?: string;
  obligatorio?: boolean;
  campo: TipoCampoPrueba;
}

export type EstadoPrueba = 'pasa' | 'no_pasa' | 'error' | 'pendiente';

export interface ResultadoPrueba {
  tipo: string;
  /** Qué se probó, en palabras ("Voltaje directo a 10 mA"). */
  descripcion: string;
  estado: EstadoPrueba;
  esperado: string;
  obtenido: string;
  fuente?: string;
}

export interface DefinicionPrueba {
  descripcion: string;
  campos: Record<string, DefCampoPrueba>;
  /** Variables que se pueden usar en las expresiones de esta prueba (por ejemplo VCC). */
  variables?: string[];
  /** Validaciones extra que dependen de varios campos a la vez. */
  revisar?(prueba: Prueba, componente: Componente): string[];
  ejecutar(componente: Componente, prueba: Prueba): ResultadoPrueba[];
}

export interface DefinicionCategoria {
  categoria: Categoria;
  /** Nombre para mostrar: "amplificador operacional". */
  nombre: string;
  plantillas: Record<string, Plantilla>;
  pruebas: Record<string, DefinicionPrueba>;
  /** Reglas propias de la categoría (filtro 2), además de las comunes. */
  reglas(componente: Componente, errores: ErrorValidacion[]): void;
  /** Resumen para la tarjeta de confirmación: "4 unidades, DIP-14". */
  resumen(componente: Componente): string;
}

/** Formatea un número con unidad y sufijo legible: 0.0123 A → "12.3 mA". */
export function formatear(valor: number, unidad: string): string {
  if (!Number.isFinite(valor)) return String(valor);
  if (valor === 0) return `0 ${unidad}`;
  const prefijos: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
    [1e-15, 'f'],
  ];
  // Se redondea a 4 cifras antes de elegir el prefijo, para que 999.99 MΩ se muestre como 1 GΩ.
  const redondeado = Number(valor.toPrecision(4));
  const absoluto = Math.abs(redondeado);
  const [factor, prefijo] = prefijos.find(([f]) => absoluto >= f) ?? prefijos[prefijos.length - 1]!;
  return `${Number((redondeado / factor).toPrecision(4))} ${prefijo}${unidad}`;
}
