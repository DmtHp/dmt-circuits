import type { Elemento, TipoElemento } from '../circuito';
import { primitivaBobina } from './bobina';
import { primitivaCondensador } from './condensador';
import { primitivaFuenteCorriente } from './fuenteCorriente';
import { primitivaFuenteVoltaje } from './fuenteVoltaje';
import type { Primitiva } from './primitiva';
import { primitivaResistencia } from './resistencia';
import { primitivaVCCS } from './vccs';
import { primitivaVCVS } from './vcvs';

const PRIMITIVAS: { [T in TipoElemento]: Primitiva<Extract<Elemento, { tipo: T }>> } = {
  resistencia: primitivaResistencia,
  fuenteVoltaje: primitivaFuenteVoltaje,
  fuenteCorriente: primitivaFuenteCorriente,
  vcvs: primitivaVCVS,
  vccs: primitivaVCCS,
  bobina: primitivaBobina,
  condensador: primitivaCondensador,
};

/** Devuelve la primitiva que sabe estampar y medir este elemento, o undefined si el tipo no existe. */
export function primitivaDe(e: Elemento): Primitiva<Elemento> | undefined {
  // TypeScript no puede relacionar e.tipo con el tipo exacto de la primitiva; el mapa de arriba sí lo garantiza.
  return (PRIMITIVAS as Record<string, Primitiva<Elemento> | undefined>)[e.tipo];
}

export type { ConexionDC, Estampador, Primitiva } from './primitiva';
