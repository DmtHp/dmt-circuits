/** Circuitos de ejemplo para empezar sin dibujar nada. */

import { agregarCables, DOCUMENTO_VACIO, type Documento, type Pieza } from './documento';

function pieza(p: Partial<Pieza> & Pick<Pieza, 'id' | 'tipo' | 'nombre' | 'x' | 'y'>): Pieza {
  return { rotacion: 0, parametros: {}, ...p };
}

export interface Ejemplo {
  titulo: string;
  descripcion: string;
  documento: Documento;
}

/** LED con resistencia e interruptor: al cerrar SW1 el LED enciende con ~9 mA. */
function ledConInterruptor(): Documento {
  let doc: Documento = {
    ...DOCUMENTO_VACIO,
    piezas: [
      pieza({ id: 'e1v', tipo: 'fuente_dc', nombre: 'V1', x: 0, y: 0, parametros: { voltaje_v: 5 } }),
      pieza({ id: 'e1s', tipo: 'componente', componenteId: 'interruptor', nombre: 'SW1', x: 2, y: -2, parametros: { cerrado: 0 } }),
      pieza({ id: 'e1r', tipo: 'componente', componenteId: 'resistencia', nombre: 'R1', x: 8, y: -2, parametros: { resistencia_ohm: 330, potencia_w: 0.25 } }),
      pieza({ id: 'e1d', tipo: 'componente', componenteId: 'led_rojo_5mm', nombre: 'D1', x: 14, y: -2, rotacion: 1 }),
      pieza({ id: 'e1a', tipo: 'amperimetro', nombre: 'AM1', x: 14, y: 2, rotacion: 1 }),
      pieza({ id: 'e1g', tipo: 'tierra', nombre: 'GND1', x: 0, y: 8 }),
    ],
  };
  doc = agregarCables(doc, [
    { a: { x: 0, y: 0 }, b: { x: 0, y: -2 } },
    { a: { x: 0, y: -2 }, b: { x: 2, y: -2 } },
    { a: { x: 6, y: -2 }, b: { x: 8, y: -2 } },
    { a: { x: 12, y: -2 }, b: { x: 14, y: -2 } },
    { a: { x: 0, y: 4 }, b: { x: 0, y: 8 } },
    { a: { x: 14, y: 6 }, b: { x: 14, y: 8 } },
    { a: { x: 14, y: 8 }, b: { x: 0, y: 8 } },
  ]);
  return doc;
}

/** Filtro RC pasa bajos con un generador de onda cuadrada y las dos sondas del osciloscopio. */
function filtroRC(): Documento {
  let doc: Documento = {
    ...DOCUMENTO_VACIO,
    piezas: [
      pieza({ id: 'e2v', tipo: 'fuente_senal', nombre: 'VS1', x: 0, y: 0, parametros: { forma: 1, amplitud_v: 2.5, frecuencia_hz: 100, desplazamiento_v: 2.5 } }),
      pieza({ id: 'e2r', tipo: 'componente', componenteId: 'resistencia', nombre: 'R1', x: 2, y: -2, parametros: { resistencia_ohm: 10e3, potencia_w: 0.25 } }),
      pieza({ id: 'e2c', tipo: 'componente', componenteId: 'condensador', nombre: 'C1', x: 8, y: -2, rotacion: 1, parametros: { capacitancia_f: 100e-9, voltaje_maximo_v: 50 } }),
      pieza({ id: 'e2p1', tipo: 'sonda', nombre: 'P1', x: 2, y: -2, parametros: { canal: 1 } }),
      pieza({ id: 'e2p2', tipo: 'sonda', nombre: 'P2', x: 8, y: -2, parametros: { canal: 2 } }),
      pieza({ id: 'e2g', tipo: 'tierra', nombre: 'GND1', x: 0, y: 6 }),
    ],
  };
  doc = agregarCables(doc, [
    { a: { x: 0, y: 0 }, b: { x: 0, y: -2 } },
    { a: { x: 0, y: -2 }, b: { x: 2, y: -2 } },
    { a: { x: 6, y: -2 }, b: { x: 8, y: -2 } },
    { a: { x: 0, y: 4 }, b: { x: 0, y: 6 } },
    { a: { x: 8, y: 2 }, b: { x: 8, y: 6 } },
    { a: { x: 8, y: 6 }, b: { x: 0, y: 6 } },
  ]);
  return doc;
}

/** LM358 como comparador: la salida cambia cuando el potenciómetro pasa la referencia de 2.5 V. */
function comparador(): Documento {
  let doc: Documento = {
    ...DOCUMENTO_VACIO,
    piezas: [
      pieza({ id: 'e3v', tipo: 'fuente_dc', nombre: 'V1', x: -10, y: 0, parametros: { voltaje_v: 5 } }),
      pieza({ id: 'e3ref', tipo: 'fuente_dc', nombre: 'VREF', x: 0, y: 8, parametros: { voltaje_v: 2.5 } }),
      // LM358 en (4,0): 1 OUT1 (4,0), 2 IN1− (4,1), 3 IN1+ (4,2), 4 GND (4,3), 8 VCC (10,0).
      pieza({ id: 'e3u', tipo: 'componente', componenteId: 'lm358', nombre: 'U1', x: 4, y: 0 }),
      // Girado 270°: B arriba en (−6,0), A abajo en (−6,4), cursor W a la derecha en (−4,2).
      pieza({ id: 'e3pot', tipo: 'componente', componenteId: 'potenciometro', nombre: 'RV1', x: -6, y: 4, rotacion: 3, parametros: { resistencia_ohm: 10e3, posicion: 0.3 } }),
      pieza({ id: 'e3vm', tipo: 'voltimetro', nombre: 'VM1', x: 14, y: 0, rotacion: 1 }),
      pieza({ id: 'e3g', tipo: 'tierra', nombre: 'GND1', x: -10, y: 20 }),
    ],
  };
  doc = agregarCables(doc, [
    // Línea de 5 V arriba y tierra abajo.
    { a: { x: -10, y: 0 }, b: { x: -10, y: -2 } },
    { a: { x: -10, y: -2 }, b: { x: -6, y: -2 } },
    { a: { x: -6, y: -2 }, b: { x: 12, y: -2 } },
    { a: { x: 12, y: -2 }, b: { x: 12, y: 0 } },
    { a: { x: 12, y: 0 }, b: { x: 10, y: 0 } },
    { a: { x: -10, y: 4 }, b: { x: -10, y: 20 } },
    { a: { x: -10, y: 20 }, b: { x: 14, y: 20 } },
    // Potenciómetro entre 5 V y tierra; el cursor va a IN1+.
    { a: { x: -6, y: 0 }, b: { x: -6, y: -2 } },
    { a: { x: -6, y: 4 }, b: { x: -6, y: 20 } },
    { a: { x: -4, y: 2 }, b: { x: 4, y: 2 } },
    // Referencia de 2.5 V a IN1−.
    { a: { x: 0, y: 8 }, b: { x: 1, y: 8 } },
    { a: { x: 1, y: 8 }, b: { x: 1, y: 1 } },
    { a: { x: 1, y: 1 }, b: { x: 4, y: 1 } },
    { a: { x: 0, y: 12 }, b: { x: 0, y: 20 } },
    // Tierra del integrado.
    { a: { x: 4, y: 3 }, b: { x: 3, y: 3 } },
    { a: { x: 3, y: 3 }, b: { x: 3, y: 20 } },
    // Voltímetro en la salida.
    { a: { x: 4, y: 0 }, b: { x: 4, y: -1 } },
    { a: { x: 4, y: -1 }, b: { x: 14, y: -1 } },
    { a: { x: 14, y: -1 }, b: { x: 14, y: 0 } },
    { a: { x: 14, y: 4 }, b: { x: 14, y: 20 } },
  ]);
  return doc;
}

export const EJEMPLOS: Ejemplo[] = [
  { titulo: 'LED con interruptor', descripcion: 'Cierra SW1 con un clic y mira la corriente del LED.', documento: ledConInterruptor() },
  { titulo: 'Filtro RC', descripcion: 'Onda cuadrada de 100 Hz por un RC de 1 ms: mira las dos señales en el osciloscopio.', documento: filtroRC() },
  { titulo: 'Comparador con LM358', descripcion: 'Mueve el potenciómetro: la salida salta cuando pasa los 2.5 V.', documento: comparador() },
];
