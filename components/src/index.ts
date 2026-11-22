/** API pública del sistema de componentes. */
export { validarComponente, pinesDeEncapsulado, TAMANO_MAXIMO_BYTES, type ResultadoValidacion, type ResultadoFiltro, type EstadoFiltro } from './validar';
export { construir, RESISTENCIA_PIN_LIBRE_OHM, type Instancia } from './construir';
export { detectarCategoria, type Deteccion } from './detectar';
export { evaluarExpresion, valorDe, ErrorExpresion, type NumeroOExpresion } from './expresiones';
export { CATEGORIAS_DEFINIDAS, obtenerCategoria, type DefinicionCategoria, type ResultadoPrueba, type EstadoPrueba } from './categorias';
export { BIBLIOTECA, archivosBiblioteca } from './biblioteca';
export * from './formato';
export type { ErrorValidacion } from './esquema';
