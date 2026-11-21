import type { Elemento, TipoElemento } from '../circuito';
import { primitivaBobina } from './bobina';
import { primitivaCondensador } from './condensador';
import { primitivaDiodo } from './diodo';
import { primitivaFuenteCorriente } from './fuenteCorriente';
import { primitivaFuenteVoltaje } from './fuenteVoltaje';
import { primitivaLimitador } from './limitador';
import type { Primitiva } from './primitiva';
import { primitivaResistencia } from './resistencia';
import { primitivaVCCS } from './vccs';
import { primitivaVCVS } from './vcvs';

/** Una primitiva cualquiera, con su estado sin tipo concreto. */
export type PrimitivaGenerica = Primitiva<Elemento, unknown>;

// Cada tipo de elemento con su primitiva. El tipo del mapa obliga a que no falte ninguno.
// El estado de cada primitiva es distinto, por eso aquí queda abierto (any).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRIMITIVAS: { [T in TipoElemento]: Primitiva<Extract<Elemento, { tipo: T }>, any> } = {
  resistencia: primitivaResistencia,
  fuenteVoltaje: primitivaFuenteVoltaje,
  fuenteCorriente: primitivaFuenteCorriente,
  vcvs: primitivaVCVS,
  vccs: primitivaVCCS,
  bobina: primitivaBobina,
  condensador: primitivaCondensador,
  diodo: primitivaDiodo,
  limitador: primitivaLimitador,
};

/** Devuelve la primitiva que sabe estampar y medir este elemento, o undefined si el tipo no existe. */
export function primitivaDe(e: Elemento): PrimitivaGenerica | undefined {
  // TypeScript no puede relacionar e.tipo con el tipo exacto de la primitiva; el mapa de arriba sí lo garantiza.
  return (PRIMITIVAS as unknown as Record<string, PrimitivaGenerica | undefined>)[e.tipo];
}

export { VOLTAJE_TERMICO_V } from './diodo';
export type { ConexionDC, Contexto, Estampador, Medida, MetodoIntegracion, Modo, Primitiva } from './primitiva';
