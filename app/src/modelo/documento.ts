/**
 * El documento del editor: qué piezas hay en el lienzo y cómo están cableadas.
 *
 * Todo se mide en unidades de rejilla (una unidad = un punto de la rejilla).
 * Las funciones de este archivo no modifican el documento: devuelven uno
 * nuevo. Así deshacer/rehacer es guardar documentos anteriores, y React sabe
 * qué cambió comparando referencias.
 */

export type Rotacion = 0 | 1 | 2 | 3;

export interface Punto {
  x: number;
  y: number;
}

/** Piezas propias del editor (fuentes, tierra, instrumentos) o un componente de la biblioteca. */
export type TipoPieza = 'componente' | 'fuente_dc' | 'fuente_senal' | 'tierra' | 'voltimetro' | 'amperimetro' | 'sonda';

export interface Pieza {
  id: string;
  tipo: TipoPieza;
  /** id del componente en la biblioteca (solo para tipo "componente"). */
  componenteId?: string;
  /** Nombre visible y en la simulación: R1, D2, U1, V1… */
  nombre: string;
  x: number;
  y: number;
  /** Giros de 90° en sentido horario. */
  rotacion: Rotacion;
  /** Valores editables: resistencia_ohm, voltaje_v, frecuencia_hz, canal… */
  parametros: Record<string, number>;
}

/** Un tramo recto de cable entre dos puntos de la rejilla. */
export interface Cable {
  id: string;
  a: Punto;
  b: Punto;
}

export interface Documento {
  version: 1;
  piezas: Pieza[];
  cables: Cable[];
}

export const DOCUMENTO_VACIO: Documento = { version: 1, piezas: [], cables: [] };

let contador = 0;
/** Identificador único para piezas y cables nuevos. */
export function nuevoId(prefijo: string): string {
  contador++;
  return `${prefijo}${Date.now().toString(36)}${contador.toString(36)}`;
}

export function mismoPunto(a: Punto, b: Punto): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Siguiente nombre libre con un prefijo: si existen R1 y R3, da R2. */
export function nombreLibre(doc: Documento, prefijo: string): string {
  const usados = new Set(doc.piezas.map((p) => p.nombre.toUpperCase()));
  for (let n = 1; ; n++) {
    const nombre = `${prefijo}${n}`;
    if (!usados.has(nombre.toUpperCase())) return nombre;
  }
}

export function agregarPieza(doc: Documento, pieza: Pieza): Documento {
  return { ...doc, piezas: [...doc.piezas, pieza] };
}

export function cambiarPieza(doc: Documento, id: string, cambios: Partial<Omit<Pieza, 'id'>>): Documento {
  return { ...doc, piezas: doc.piezas.map((p) => (p.id === id ? { ...p, ...cambios } : p)) };
}

export function cambiarParametro(doc: Documento, id: string, nombre: string, valor: number): Documento {
  return {
    ...doc,
    piezas: doc.piezas.map((p) => (p.id === id ? { ...p, parametros: { ...p.parametros, [nombre]: valor } } : p)),
  };
}

export function rotarPieza(doc: Documento, id: string): Documento {
  return { ...doc, piezas: doc.piezas.map((p) => (p.id === id ? { ...p, rotacion: ((p.rotacion + 1) % 4) as Rotacion } : p)) };
}

export function borrar(doc: Documento, ids: ReadonlySet<string>): Documento {
  return { ...doc, piezas: doc.piezas.filter((p) => !ids.has(p.id)), cables: doc.cables.filter((c) => !ids.has(c.id)) };
}

/**
 * Agrega tramos de cable. Los tramos de largo cero se ignoran y los que ya
 * existen (en cualquier sentido) no se repiten.
 */
export function agregarCables(doc: Documento, tramos: { a: Punto; b: Punto }[]): Documento {
  const nuevos: Cable[] = [];
  const existe = (a: Punto, b: Punto): boolean =>
    [...doc.cables, ...nuevos].some((c) => (mismoPunto(c.a, a) && mismoPunto(c.b, b)) || (mismoPunto(c.a, b) && mismoPunto(c.b, a)));
  for (const { a, b } of tramos) {
    if (mismoPunto(a, b) || existe(a, b)) continue;
    nuevos.push({ id: nuevoId('c'), a, b });
  }
  return nuevos.length === 0 ? doc : { ...doc, cables: [...doc.cables, ...nuevos] };
}

/** Revisa que un objeto leído (de un archivo o del navegador) tenga forma de documento. */
export function esDocumento(dato: unknown): dato is Documento {
  if (typeof dato !== 'object' || dato === null) return false;
  const d = dato as Partial<Documento>;
  return d.version === 1 && Array.isArray(d.piezas) && Array.isArray(d.cables);
}
