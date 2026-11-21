/** API pública del motor de cálculo. */
export * from './circuito';
export { analizarDC, type MedidaElemento, type ResultadoDC } from './dc';
export { GMIN_S, OPCIONES_NEWTON, type Estrategia, type OpcionesNewton } from './newton';
export { VOLTAJE_TERMICO_V, type MetodoIntegracion } from './primitivas';
export { ErrorCircuito, type CodigoError, type DetalleError } from './errores';
export { ErrorMatrizSingular, MatrizDensa, type Factorizacion, type Matriz } from './matriz';
export { leerNetlist, leerValor } from './netlist';
export { evaluarForma } from './formasDeOnda';
export { analizarTransitorio, type OpcionesTransitorio, type ResultadoTransitorio, type SerieElemento } from './transitorio';
