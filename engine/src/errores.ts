/**
 * Errores del motor con mensajes en lenguaje simple.
 * Cada error dice qué pasó, dónde (nodos o elementos) y, cuando se puede, cómo arreglarlo.
 */

export type CodigoError =
  | 'circuito_vacio'
  | 'valor_invalido'
  | 'nombre_repetido'
  | 'sin_tierra'
  | 'nodo_flotante'
  | 'bucle_fuentes_voltaje'
  | 'matriz_singular'
  | 'no_converge'
  | 'paso_muy_pequeno'
  | 'netlist';

export interface DetalleError {
  elementos?: string[];
  nodos?: string[];
  /** Línea de la netlist (empieza en 1), si el error viene del texto. */
  linea?: number;
}

export class ErrorCircuito extends Error {
  readonly codigo: CodigoError;
  /** Elementos involucrados, por nombre. */
  readonly elementos: readonly string[];
  /** Nodos involucrados. */
  readonly nodos: readonly string[];
  readonly linea: number | undefined;

  constructor(codigo: CodigoError, mensaje: string, detalle: DetalleError = {}) {
    super(mensaje);
    this.name = 'ErrorCircuito';
    this.codigo = codigo;
    this.elementos = detalle.elementos ?? [];
    this.nodos = detalle.nodos ?? [];
    this.linea = detalle.linea;
  }
}
