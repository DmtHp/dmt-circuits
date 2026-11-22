/**
 * Geometría de cada pieza: dónde están sus pines y qué espacio ocupa.
 *
 * Los pines están en las mismas posiciones en la vista de esquema y en la
 * vista física, así los cables valen para las dos. Para un integrado DIP, por
 * ejemplo, los pines 1…N/2 van a la izquierda de arriba a abajo y los demás a
 * la derecha de abajo hacia arriba, como al mirar el chip desde arriba.
 */

import { pinesDeEncapsulado, type Componente } from '../../../components/src';
import type { Pieza, Punto, Rotacion } from './documento';

export interface PinGeometrico {
  /** Nombre del pin en el componente (o "+", "-", "p" en las piezas propias). */
  nombre: string;
  /** Número físico (1, 2, 3…). */
  n: number;
  /** Posición local, antes de rotar, en unidades de rejilla. */
  x: number;
  y: number;
}

export type Forma =
  | 'dos_pines'
  | 'potenciometro'
  | 'dip'
  | 'en_linea'
  | 'fuente'
  | 'tierra'
  | 'instrumento'
  | 'sonda';

export interface Huella {
  forma: Forma;
  pines: PinGeometrico[];
  /** Caja que ocupa el dibujo (local, sin rotar), en unidades de rejilla. */
  caja: { x0: number; y0: number; x1: number; y1: number };
}

/** Gira un punto local según la rotación (cada paso son 90° en sentido horario). */
export function rotar(p: Punto, rotacion: Rotacion): Punto {
  switch (rotacion) {
    case 0:
      return { x: p.x, y: p.y };
    case 1:
      return { x: -p.y, y: p.x };
    case 2:
      return { x: -p.x, y: -p.y };
    case 3:
      return { x: p.y, y: -p.x };
  }
}

export function huellaDe(pieza: Pieza, componente: Componente | undefined): Huella {
  switch (pieza.tipo) {
    case 'fuente_dc':
    case 'fuente_senal':
      return {
        forma: 'fuente',
        pines: [
          { nombre: '+', n: 1, x: 0, y: 0 },
          { nombre: '-', n: 2, x: 0, y: 4 },
        ],
        caja: { x0: -1.2, y0: 0, x1: 1.2, y1: 4 },
      };
    case 'tierra':
      return { forma: 'tierra', pines: [{ nombre: 'gnd', n: 1, x: 0, y: 0 }], caja: { x0: -1, y0: 0, x1: 1, y1: 1.6 } };
    case 'voltimetro':
    case 'amperimetro':
      return {
        forma: 'instrumento',
        pines: [
          { nombre: '+', n: 1, x: 0, y: 0 },
          { nombre: '-', n: 2, x: 4, y: 0 },
        ],
        caja: { x0: 0, y0: -1.4, x1: 4, y1: 1.4 },
      };
    case 'sonda':
      return { forma: 'sonda', pines: [{ nombre: 'p', n: 1, x: 0, y: 0 }], caja: { x0: -0.6, y0: -2.4, x1: 2.4, y1: 0 } };
    case 'componente':
      return huellaDeComponente(componente);
  }
}

function huellaDeComponente(c: Componente | undefined): Huella {
  if (!c) return { forma: 'dos_pines', pines: [], caja: { x0: 0, y0: -1, x1: 4, y1: 1 } };
  const ordenados = [...c.pines].sort((a, b) => a.n - b.n);
  const bloque = c.modelo.tipo === 'subcircuito' ? c.modelo.bloques?.[0] : undefined;

  if (bloque?.usa === 'potenciometro' && ordenados.length === 3) {
    const [a, w, b] = bloque.pines;
    const n = (nombre: string | undefined) => ordenados.find((p) => p.nombre === nombre)?.n ?? 0;
    return {
      forma: 'potenciometro',
      pines: [
        { nombre: a!, n: n(a), x: 0, y: 0 },
        { nombre: w!, n: n(w), x: 2, y: 2 },
        { nombre: b!, n: n(b), x: 4, y: 0 },
      ],
      caja: { x0: 0, y0: -1, x1: 4, y1: 2 },
    };
  }

  if (ordenados.length === 2) {
    return {
      forma: 'dos_pines',
      pines: ordenados.map((p, i) => ({ nombre: p.nombre, n: p.n, x: i * 4, y: 0 })),
      caja: { x0: 0, y0: -1, x1: 4, y1: 1 },
    };
  }

  const total = pinesDeEncapsulado(c.encapsulado) ?? ordenados.length;
  if (/^(DIP|PDIP|SOIC|SOP|SSOP|TSSOP|MSOP)-/i.test(c.encapsulado) && total % 2 === 0) {
    const mitad = total / 2;
    const ancho = 6;
    return {
      forma: 'dip',
      pines: ordenados.map((p) =>
        p.n <= mitad ? { nombre: p.nombre, n: p.n, x: 0, y: p.n - 1 } : { nombre: p.nombre, n: p.n, x: ancho, y: total - p.n },
      ),
      caja: { x0: 0.6, y0: -0.8, x1: ancho - 0.6, y1: mitad - 0.2 },
    };
  }

  // Cualquier otro: pines en línea, separados 2 unidades.
  return {
    forma: 'en_linea',
    pines: ordenados.map((p, i) => ({ nombre: p.nombre, n: p.n, x: i * 2, y: 0 })),
    caja: { x0: -0.5, y0: -2, x1: (ordenados.length - 1) * 2 + 0.5, y1: 0 },
  };
}

export interface PinAbsoluto extends PinGeometrico {
  /** Posición en el lienzo (unidades de rejilla). */
  X: number;
  Y: number;
}

export function pinesEnLienzo(pieza: Pieza, huella: Huella): PinAbsoluto[] {
  return huella.pines.map((p) => {
    const r = rotar(p, pieza.rotacion);
    return { ...p, X: pieza.x + r.x, Y: pieza.y + r.y };
  });
}

/** Caja de la pieza en el lienzo, ya rotada. */
export function cajaEnLienzo(pieza: Pieza, huella: Huella): { x0: number; y0: number; x1: number; y1: number } {
  const { x0, y0, x1, y1 } = huella.caja;
  const esquinas = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x0, y: y1 },
    { x: x1, y: y1 },
  ].map((p) => rotar(p, pieza.rotacion));
  return {
    x0: pieza.x + Math.min(...esquinas.map((p) => p.x)),
    y0: pieza.y + Math.min(...esquinas.map((p) => p.y)),
    x1: pieza.x + Math.max(...esquinas.map((p) => p.x)),
    y1: pieza.y + Math.max(...esquinas.map((p) => p.y)),
  };
}
