/**
 * El formato JSON de los componentes, versión 1.0.
 *
 * Un componente es un archivo de datos, nunca de código. Ejemplo mínimo:
 *
 *   {
 *     "formato": "1.0",
 *     "categoria": "diodo",
 *     "id": "1n4148",
 *     "nombre": "1N4148 - Diodo de señal",
 *     "encapsulado": "DO-35",
 *     "fidelidad": "comportamiento",
 *     "pines": [ { "n": 1, "nombre": "A" }, { "n": 2, "nombre": "K" } ],
 *     "modelo": {
 *       "tipo": "subcircuito",
 *       "bloques": [ { "usa": "diodo_basico", "pines": ["A", "K"], "parametros": { "is_a": 2.52e-9, "n": 1.752 } } ]
 *     },
 *     "pruebas": [ { "tipo": "voltaje_directo", "corriente_a": 0.01, "maximo_v": 1.0, "fuente": "…" } ]
 *   }
 *
 * El modelo eléctrico se describe con:
 *  - "bloques": plantillas que ofrece la categoría (diodo_basico, opamp_basico…),
 *    cada una conectada a pines del componente y con sus parámetros;
 *  - "netlist": líneas de netlist del motor (R, C, L, V, I, E, G, D, A) que usan
 *    nombres de pines como nodos; cualquier otro nombre es un nodo interno.
 * Las compuertas lógicas usan un modelo "logico" (tabla de verdad o función).
 */

import type { Esquema } from './esquema';
import { obligatorio, opcional } from './esquema';
import type { NumeroOExpresion } from './expresiones';

export const VERSION_FORMATO = '1.0';

export const CATEGORIAS = ['pasivo', 'diodo', 'amplificador_operacional', 'compuerta_logica'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** Cuánto confiar en el modelo: ideal (de libro), comportamiento (macromodelo con datos del datasheet) o del fabricante. */
export const FIDELIDADES = ['ideal', 'comportamiento', 'fabricante'] as const;
export type Fidelidad = (typeof FIDELIDADES)[number];

export const FUNCIONES_LOGICAS = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'NOT', 'BUFFER'] as const;
export type FuncionLogica = (typeof FUNCIONES_LOGICAS)[number];

export interface Pin {
  /** Número físico del pin (1, 2, 3…), como en el encapsulado. */
  n: number;
  nombre: string;
  /** Descripción libre, por ejemplo "entrada inversora 1". */
  funcion?: string;
}

export interface Bloque {
  /** Nombre de la plantilla de la categoría, por ejemplo "opamp_basico". */
  usa: string;
  /** Pines del componente conectados a los terminales de la plantilla, en su orden. */
  pines: string[];
  parametros?: Record<string, NumeroOExpresion>;
}

export interface ModeloSubcircuito {
  tipo: 'subcircuito';
  bloques?: Bloque[];
  netlist?: string[];
}

export interface UnidadLogica {
  entradas: string[];
  salida: string;
  /** Función estándar… */
  funcion?: FuncionLogica;
  /** …o tabla de verdad: una fila por combinación, "entradas:salida", por ejemplo "01:1". */
  tabla?: string[];
}

export interface ModeloLogico {
  tipo: 'logico';
  familia: 'TTL' | 'CMOS';
  vcc_v: number;
  /** Voltaje de entrada máximo que se lee como 0. */
  vil_v: number;
  /** Voltaje de entrada mínimo que se lee como 1. */
  vih_v: number;
  /** Voltaje de salida en 0. */
  vol_v: number;
  /** Voltaje de salida en 1. */
  voh_v: number;
  retardo_ns?: number;
  unidades: UnidadLogica[];
}

export type Modelo = ModeloSubcircuito | ModeloLogico;

/** Una prueba eléctrica. Sus campos dependen del tipo (ver cada categoría). */
export interface Prueba {
  tipo: string;
  /** De dónde sale el valor esperado (datasheet, tabla, página). */
  fuente?: string;
  [campo: string]: unknown;
}

export interface Componente {
  formato: string;
  categoria: Categoria;
  id: string;
  nombre: string;
  descripcion?: string;
  fabricante?: string;
  /** Enlace al datasheet. */
  datasheet?: string;
  encapsulado: string;
  fidelidad: Fidelidad;
  pines: Pin[];
  modelo: Modelo;
  pruebas: Prueba[];
}

const texto: Esquema = { tipo: 'texto', largoMaximo: 300 };
const nombreCorto: Esquema = {
  tipo: 'texto',
  largoMaximo: 40,
  patron: /^[A-Za-z0-9_+\-#/.]+$/,
  descripcionPatron: 'letras, números o los signos _ + - # / . sin espacios (por ejemplo "IN1+", "OUT", "VCC")',
};

const esquemaBloque: Esquema = {
  tipo: 'objeto',
  campos: {
    usa: obligatorio({ tipo: 'texto', largoMaximo: 60 }),
    pines: obligatorio({ tipo: 'lista', de: nombreCorto, minimo: 1, maximo: 64 }),
    parametros: opcional({ tipo: 'mapa', de: { tipo: 'numeroOExpresion' } }),
  },
};

const esquemaModelo: Esquema = {
  tipo: 'segun',
  campo: 'tipo',
  variantes: {
    subcircuito: {
      tipo: 'objeto',
      campos: {
        tipo: obligatorio({ tipo: 'opcion', valores: ['subcircuito'] }),
        bloques: opcional({ tipo: 'lista', de: esquemaBloque, maximo: 64 }),
        netlist: opcional({ tipo: 'lista', de: { tipo: 'texto', largoMaximo: 300 }, maximo: 500 }),
      },
    },
    logico: {
      tipo: 'objeto',
      campos: {
        tipo: obligatorio({ tipo: 'opcion', valores: ['logico'] }),
        familia: obligatorio({ tipo: 'opcion', valores: ['TTL', 'CMOS'] }),
        vcc_v: obligatorio({ tipo: 'numero' }),
        vil_v: obligatorio({ tipo: 'numero' }),
        vih_v: obligatorio({ tipo: 'numero' }),
        vol_v: obligatorio({ tipo: 'numero' }),
        voh_v: obligatorio({ tipo: 'numero' }),
        retardo_ns: opcional({ tipo: 'numero', minimo: 0 }),
        unidades: obligatorio({
          tipo: 'lista',
          minimo: 1,
          maximo: 32,
          de: {
            tipo: 'objeto',
            campos: {
              entradas: obligatorio({ tipo: 'lista', de: nombreCorto, minimo: 1, maximo: 8 }),
              salida: obligatorio(nombreCorto),
              funcion: opcional({ tipo: 'opcion', valores: FUNCIONES_LOGICAS }),
              tabla: opcional({
                tipo: 'lista',
                de: { tipo: 'texto', patron: /^[01]+:[01]$/, descripcionPatron: 'entradas:salida con ceros y unos, por ejemplo "01:1"' },
                maximo: 256,
              }),
            },
          },
        }),
      },
    },
  },
};

/** Estructura que debe tener cualquier componente (filtro 1). */
export const ESQUEMA_COMPONENTE: Esquema = {
  tipo: 'objeto',
  campos: {
    formato: obligatorio({ tipo: 'opcion', valores: [VERSION_FORMATO] }),
    categoria: obligatorio({ tipo: 'opcion', valores: CATEGORIAS }),
    id: obligatorio({
      tipo: 'texto',
      largoMaximo: 60,
      patron: /^[a-z0-9][a-z0-9_-]*$/,
      descripcionPatron: 'minúsculas, números, guion y guion bajo, sin espacios (por ejemplo "lm358")',
    }),
    nombre: obligatorio({ tipo: 'texto', largoMaximo: 120 }),
    descripcion: opcional(texto),
    fabricante: opcional(texto),
    datasheet: opcional({ tipo: 'texto', patron: /^https?:\/\/\S+$/, descripcionPatron: 'un enlace que empiece con http:// o https://', largoMaximo: 500 }),
    encapsulado: obligatorio({ tipo: 'texto', largoMaximo: 30 }),
    fidelidad: obligatorio({ tipo: 'opcion', valores: FIDELIDADES }),
    pines: obligatorio({
      tipo: 'lista',
      minimo: 1,
      maximo: 64,
      de: {
        tipo: 'objeto',
        campos: {
          n: obligatorio({ tipo: 'numero', entero: true, minimo: 1, maximo: 64 }),
          nombre: obligatorio(nombreCorto),
          funcion: opcional(texto),
        },
      },
    }),
    modelo: obligatorio(esquemaModelo),
    pruebas: obligatorio({
      tipo: 'lista',
      maximo: 50,
      de: {
        tipo: 'objeto',
        permitirOtros: true,
        campos: { tipo: obligatorio({ tipo: 'texto', largoMaximo: 60 }), fuente: opcional(texto), descripcion: opcional(texto) },
      },
    }),
  },
};
