/** API pública del motor de cálculo. */
export * from './circuito';
export { analizarDC, type MedidaElemento, type ResultadoDC } from './dc';
export { ErrorCircuito, type CodigoError, type DetalleError } from './errores';
export { ErrorMatrizSingular, MatrizDensa, type Factorizacion, type Matriz } from './matriz';
export { leerNetlist, leerValor } from './netlist';
