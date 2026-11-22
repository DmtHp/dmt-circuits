/**
 * Catálogo de lo que se puede poner en el lienzo: el kit de la biblioteca
 * (components/biblioteca) más las piezas propias del editor (fuentes, tierra
 * e instrumentos), con sus valores por defecto y qué se puede editar.
 */

import { valorDe, type Componente } from '../../../components/src';
import type { TipoPieza } from './documento';

export interface DefEditable {
  clave: string;
  etiqueta: string;
  unidad: string;
  /** valor: campo de texto con sufijos (4.7k); deslizador: 0 a 1; interruptor: 0/1; opcion: lista. */
  control: 'valor' | 'deslizador' | 'interruptor' | 'opcion';
  opciones?: { valor: number; texto: string }[];
}

export interface DefPieza {
  tipo: TipoPieza;
  componenteId?: string;
  titulo: string;
  grupo: 'Fuentes' | 'Pasivos' | 'Semiconductores' | 'Integrados' | 'Instrumentos';
  prefijo: string;
  parametros: Record<string, number>;
  editables: DefEditable[];
}

const PIEZAS_PROPIAS: DefPieza[] = [
  {
    tipo: 'fuente_dc',
    titulo: 'Fuente DC',
    grupo: 'Fuentes',
    prefijo: 'V',
    parametros: { voltaje_v: 5 },
    editables: [{ clave: 'voltaje_v', etiqueta: 'Voltaje', unidad: 'V', control: 'valor' }],
  },
  {
    tipo: 'fuente_senal',
    titulo: 'Generador de señal',
    grupo: 'Fuentes',
    prefijo: 'VS',
    parametros: { forma: 0, amplitud_v: 1, frecuencia_hz: 1000, desplazamiento_v: 0 },
    editables: [
      {
        clave: 'forma',
        etiqueta: 'Forma',
        unidad: '',
        control: 'opcion',
        opciones: [
          { valor: 0, texto: 'Seno' },
          { valor: 1, texto: 'Cuadrada' },
        ],
      },
      { clave: 'amplitud_v', etiqueta: 'Amplitud (pico)', unidad: 'V', control: 'valor' },
      { clave: 'frecuencia_hz', etiqueta: 'Frecuencia', unidad: 'Hz', control: 'valor' },
      { clave: 'desplazamiento_v', etiqueta: 'Nivel DC', unidad: 'V', control: 'valor' },
    ],
  },
  { tipo: 'tierra', titulo: 'Tierra', grupo: 'Fuentes', prefijo: 'GND', parametros: {}, editables: [] },
  { tipo: 'voltimetro', titulo: 'Voltímetro', grupo: 'Instrumentos', prefijo: 'VM', parametros: {}, editables: [] },
  { tipo: 'amperimetro', titulo: 'Amperímetro', grupo: 'Instrumentos', prefijo: 'AM', parametros: {}, editables: [] },
  {
    tipo: 'sonda',
    titulo: 'Sonda del osciloscopio',
    grupo: 'Instrumentos',
    prefijo: 'P',
    parametros: { canal: 1 },
    editables: [
      {
        clave: 'canal',
        etiqueta: 'Canal',
        unidad: '',
        control: 'opcion',
        opciones: [
          { valor: 1, texto: 'CH1' },
          { valor: 2, texto: 'CH2' },
        ],
      },
    ],
  },
];

/** Qué parámetros del kit se editan en el panel, por plantilla. */
const EDITABLES_POR_PLANTILLA: Record<string, DefEditable[]> = {
  resistencia: [
    { clave: 'resistencia_ohm', etiqueta: 'Resistencia', unidad: 'Ω', control: 'valor' },
    { clave: 'potencia_w', etiqueta: 'Potencia máxima', unidad: 'W', control: 'valor' },
  ],
  condensador: [
    { clave: 'capacitancia_f', etiqueta: 'Capacitancia', unidad: 'F', control: 'valor' },
    { clave: 'voltaje_maximo_v', etiqueta: 'Voltaje máximo', unidad: 'V', control: 'valor' },
  ],
  bobina: [{ clave: 'inductancia_h', etiqueta: 'Inductancia', unidad: 'H', control: 'valor' }],
  potenciometro: [
    { clave: 'resistencia_ohm', etiqueta: 'Resistencia total', unidad: 'Ω', control: 'valor' },
    { clave: 'posicion', etiqueta: 'Posición del cursor', unidad: '', control: 'deslizador' },
  ],
  interruptor: [{ clave: 'cerrado', etiqueta: 'Cerrado', unidad: '', control: 'interruptor' }],
};

const PREFIJOS: Record<string, string> = {
  resistencia: 'R',
  condensador: 'C',
  bobina: 'L',
  potenciometro: 'RV',
  interruptor: 'SW',
};

function grupoDe(c: Componente): DefPieza['grupo'] {
  if (c.categoria === 'pasivo') return 'Pasivos';
  if (c.categoria === 'diodo') return 'Semiconductores';
  return 'Integrados';
}

/** Arma el catálogo. Las compuertas lógicas quedan fuera hasta la etapa digital. */
export function armarCatalogo(biblioteca: ReadonlyMap<string, Componente>): DefPieza[] {
  const kit: DefPieza[] = [];
  for (const c of biblioteca.values()) {
    if (c.modelo.tipo !== 'subcircuito') continue;
    const bloque = c.modelo.bloques?.[0];
    const editables = (bloque && EDITABLES_POR_PLANTILLA[bloque.usa]) ?? [];
    const parametros: Record<string, number> = {};
    for (const e of editables) {
      const crudo = bloque?.parametros?.[e.clave];
      parametros[e.clave] = crudo === undefined ? 0 : valorDe(crudo);
    }
    kit.push({
      tipo: 'componente',
      componenteId: c.id,
      titulo: c.nombre,
      grupo: grupoDe(c),
      prefijo: (bloque && PREFIJOS[bloque.usa]) ?? (c.categoria === 'diodo' ? 'D' : 'U'),
      parametros,
      editables,
    });
  }
  const orden: DefPieza['grupo'][] = ['Fuentes', 'Pasivos', 'Semiconductores', 'Integrados', 'Instrumentos'];
  return [...PIEZAS_PROPIAS, ...kit].sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo));
}

export function definicionDe(catalogo: DefPieza[], tipo: TipoPieza, componenteId?: string): DefPieza | undefined {
  return catalogo.find((d) => d.tipo === tipo && d.componenteId === componenteId);
}
