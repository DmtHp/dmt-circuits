/**
 * Análisis DC (punto de operación) con análisis nodal modificado (MNA).
 *
 * Pasos:
 * 1. Revisar el circuito: valores válidos, nombres únicos, que haya tierra,
 *    que no haya bucles de fuentes de voltaje ni nodos flotantes. Así los
 *    errores se explican en palabras antes de llegar a la matriz.
 * 2. Numerar las incógnitas: primero el voltaje de cada nodo (menos tierra),
 *    después la corriente de cada elemento que la agrega (fuentes de voltaje,
 *    VCVS, bobinas).
 * 3. Cada elemento estampa sus valores en A y z.
 * 4. Resolver A · x = z con LU y calcular voltaje, corriente y potencia de cada elemento.
 */

import { normalizarNodo, TIERRA, type Circuito, type Elemento, type Nodo } from './circuito';
import { ErrorCircuito } from './errores';
import { ErrorMatrizSingular, MatrizDensa } from './matriz';
import { primitivaDe, type Estampador, type Primitiva } from './primitivas';

export interface MedidaElemento {
  /** Voltaje del primer terminal menos el del segundo. */
  voltaje_v: number;
  /** Corriente que entra por el primer terminal y sale por el segundo. */
  corriente_a: number;
  /** voltaje × corriente. Positiva: absorbe energía. Negativa: la entrega. */
  potencia_w: number;
}

export interface ResultadoDC {
  /** Voltaje de cada nodo respecto a tierra. Incluye la tierra ("0" → 0 V). */
  voltajes: ReadonlyMap<Nodo, number>;
  /** Medidas de cada elemento, por nombre. */
  elementos: ReadonlyMap<string, MedidaElemento>;
  /** Cantidad de incógnitas del sistema A · x = z. */
  incognitas: number;
}

interface ElementoPreparado {
  elemento: Elemento;
  primitiva: Primitiva<Elemento>;
  terminales: readonly [Nodo, Nodo];
  control: readonly Nodo[];
  /** Índice de la incógnita extra, o -1. */
  extra: number;
}

export function analizarDC(circuito: Circuito): ResultadoDC {
  const preparados = prepararElementos(circuito);
  revisarTierra(preparados);
  revisarBuclesDeFuentes(preparados);
  revisarNodosFlotantes(preparados);

  // Numerar incógnitas: nodos en el orden en que aparecen, luego corrientes extra.
  const indices = new Map<Nodo, number>();
  const ordenNodos: Nodo[] = [];
  for (const p of preparados) {
    for (const nodo of [...p.terminales, ...p.control]) {
      if (nodo !== TIERRA && !indices.has(nodo)) {
        indices.set(nodo, ordenNodos.length);
        ordenNodos.push(nodo);
      }
    }
  }
  let n = ordenNodos.length;
  for (const p of preparados) {
    if (p.primitiva.variablesExtra === 1) p.extra = n++;
  }

  // Estampar.
  const matriz = new MatrizDensa(n);
  const z = new Float64Array(n);
  const indiceNodo = (nodo: Nodo): number => {
    const k = normalizarNodo(nodo);
    if (k === TIERRA) return -1;
    const i = indices.get(k);
    if (i === undefined) throw new Error(`Error interno: el nodo "${k}" no fue numerado.`);
    return i;
  };
  const estampador: Estampador = {
    indiceNodo,
    sumarA: (fila, columna, valor) => {
      if (fila >= 0 && columna >= 0) matriz.sumar(fila, columna, valor);
    },
    sumarZ: (fila, valor) => {
      if (fila >= 0) z[fila]! += valor;
    },
  };
  for (const p of preparados) p.primitiva.estampar(p.elemento, estampador, p.extra);

  // Resolver.
  let x: Float64Array;
  try {
    x = matriz.factorizar().resolver(z);
  } catch (error) {
    if (error instanceof ErrorMatrizSingular) throw errorSingular(error.columna, ordenNodos, preparados);
    throw error;
  }
  if (!x.every(Number.isFinite)) throw errorSingular(-1, ordenNodos, preparados);

  // Medir.
  const voltaje = (nodo: Nodo): number => {
    const i = indiceNodo(nodo);
    return i < 0 ? 0 : x[i]!;
  };
  const voltajes = new Map<Nodo, number>([[TIERRA, 0]]);
  for (const nodo of ordenNodos) voltajes.set(nodo, voltaje(nodo));

  const elementos = new Map<string, MedidaElemento>();
  for (const p of preparados) {
    const valorExtra = p.extra >= 0 ? x[p.extra]! : Number.NaN;
    const corriente_a = p.primitiva.corriente(p.elemento, voltaje, valorExtra);
    const voltaje_v = voltaje(p.terminales[0]) - voltaje(p.terminales[1]);
    elementos.set(p.elemento.nombre, { voltaje_v, corriente_a, potencia_w: voltaje_v * corriente_a });
  }

  return { voltajes, elementos, incognitas: n };
}

function prepararElementos(circuito: Circuito): ElementoPreparado[] {
  if (circuito.elementos.length === 0) {
    throw new ErrorCircuito('circuito_vacio', 'El circuito no tiene elementos.');
  }
  const nombres = new Set<string>();
  return circuito.elementos.map((elemento) => {
    const nombre = elemento.nombre;
    if (typeof nombre !== 'string' || nombre.trim() === '') {
      throw new ErrorCircuito('valor_invalido', 'Hay un elemento sin nombre. Cada elemento necesita un nombre único, como "R1".');
    }
    const clave = nombre.toLowerCase();
    if (nombres.has(clave)) {
      throw new ErrorCircuito('nombre_repetido', `El nombre "${nombre}" está repetido. Cada elemento necesita un nombre único.`, {
        elementos: [nombre],
      });
    }
    nombres.add(clave);

    const primitiva = primitivaDe(elemento);
    if (!primitiva) {
      throw new ErrorCircuito('valor_invalido', `${nombre}: tipo de elemento desconocido.`, { elementos: [nombre] });
    }

    const crudos = [...primitiva.terminales(elemento), ...primitiva.terminalesControl(elemento)];
    for (const nodo of crudos) {
      if (typeof nodo !== 'string' || nodo.trim() === '') {
        throw new ErrorCircuito('valor_invalido', `${nombre}: tiene un terminal sin nodo asignado.`, { elementos: [nombre] });
      }
    }

    const problemas = primitiva.validar(elemento);
    if (problemas.length > 0) {
      throw new ErrorCircuito('valor_invalido', `${nombre}: ${problemas.join(' ')}`, { elementos: [nombre] });
    }

    const [a, b] = primitiva.terminales(elemento);
    return {
      elemento,
      primitiva,
      terminales: [normalizarNodo(a), normalizarNodo(b)] as const,
      control: primitiva.terminalesControl(elemento).map(normalizarNodo),
      extra: -1,
    };
  });
}

function revisarTierra(preparados: ElementoPreparado[]): void {
  const tieneTierra = preparados.some((p) => p.terminales.includes(TIERRA) || p.control.includes(TIERRA));
  if (!tieneTierra) {
    throw new ErrorCircuito(
      'sin_tierra',
      'El circuito no tiene tierra. Conecta algún punto al nodo "0" (o "gnd"): es la referencia de 0 V contra la que se miden todos los voltajes.',
    );
  }
}

/**
 * Un bucle hecho solo de elementos que fijan voltaje (fuentes de voltaje, VCVS,
 * bobinas en DC) no tiene solución única: Kirchhoff de voltajes obliga a que
 * sumen cero, y la corriente que circula por ese bucle puede ser cualquiera.
 * Se detecta buscando, antes de agregar cada fuente, si sus dos nodos ya
 * estaban unidos por otras fuentes.
 */
function revisarBuclesDeFuentes(preparados: ElementoPreparado[]): void {
  const vecinos = new Map<Nodo, { nodo: Nodo; elemento: string }[]>();
  const conectar = (desde: Nodo, hasta: Nodo, elemento: string): void => {
    const lista = vecinos.get(desde) ?? [];
    lista.push({ nodo: hasta, elemento });
    vecinos.set(desde, lista);
  };

  for (const p of preparados) {
    if (p.primitiva.conexionDC !== 'fijaVoltaje') continue;
    const [a, b] = p.terminales;
    const nombre = p.elemento.nombre;
    if (a === b) {
      throw new ErrorCircuito(
        'bucle_fuentes_voltaje',
        `${nombre} tiene sus dos terminales en el mismo nodo (${a}), así que está en cortocircuito consigo mismo. Conecta sus terminales a nodos distintos.`,
        { elementos: [nombre], nodos: [a] },
      );
    }
    const camino = buscarCamino(vecinos, a, b);
    if (camino) {
      const involucrados = [...camino, nombre];
      throw new ErrorCircuito(
        'bucle_fuentes_voltaje',
        `${involucrados.join(', ')} forman un bucle hecho solo de fuentes de voltaje (en DC una bobina cuenta como fuente de 0 V). ` +
          'La corriente que circula por ese bucle no queda definida. Agrega una resistencia en serie o quita una de las fuentes.',
        { elementos: involucrados, nodos: [a, b] },
      );
    }
    conectar(a, b, nombre);
    conectar(b, a, nombre);
  }
}

/** Búsqueda en anchura: devuelve los nombres de los elementos del camino de `desde` a `hasta`, o null. */
function buscarCamino(
  vecinos: Map<Nodo, { nodo: Nodo; elemento: string }[]>,
  desde: Nodo,
  hasta: Nodo,
): string[] | null {
  const llegada = new Map<Nodo, { previo: Nodo; elemento: string } | null>([[desde, null]]);
  const cola: Nodo[] = [desde];
  for (let i = 0; i < cola.length; i++) {
    const actual = cola[i]!;
    if (actual === hasta) {
      const camino: string[] = [];
      let paso = llegada.get(actual);
      while (paso) {
        camino.unshift(paso.elemento);
        paso = llegada.get(paso.previo);
      }
      return camino;
    }
    for (const v of vecinos.get(actual) ?? []) {
      if (!llegada.has(v.nodo)) {
        llegada.set(v.nodo, { previo: actual, elemento: v.elemento });
        cola.push(v.nodo);
      }
    }
  }
  return null;
}

/**
 * Un nodo flotante no tiene ningún camino de corriente continua hasta tierra,
 * así que su voltaje puede ser cualquiera y la matriz queda singular.
 * Se agrupan los nodos con "unión-búsqueda": cada elemento que conduce o fija
 * voltaje une sus dos nodos en un mismo grupo; los nodos que no quedan en el
 * grupo de tierra están flotando.
 */
function revisarNodosFlotantes(preparados: ElementoPreparado[]): void {
  const padre = new Map<Nodo, Nodo>();
  const raiz = (nodo: Nodo): Nodo => {
    let r = nodo;
    while (padre.get(r) !== r) r = padre.get(r)!;
    padre.set(nodo, r);
    return r;
  };
  const agregar = (nodo: Nodo): void => {
    if (!padre.has(nodo)) padre.set(nodo, nodo);
  };

  for (const p of preparados) {
    for (const nodo of [...p.terminales, ...p.control]) agregar(nodo);
    if (p.primitiva.conexionDC !== 'abierto') padre.set(raiz(p.terminales[0]), raiz(p.terminales[1]));
  }

  const raizTierra = raiz(TIERRA);
  const flotantes = [...padre.keys()].filter((nodo) => raiz(nodo) !== raizTierra);
  if (flotantes.length === 0) return;

  const conjunto = new Set(flotantes);
  const elementos = preparados
    .filter((p) => [...p.terminales, ...p.control].some((nodo) => conjunto.has(nodo)))
    .map((p) => p.elemento.nombre);
  const plural = flotantes.length > 1;
  throw new ErrorCircuito(
    'nodo_flotante',
    `${plural ? 'Los nodos' : 'El nodo'} ${flotantes.join(', ')} ${plural ? 'están flotando' : 'está flotando'}: ` +
      'no hay un camino de corriente continua hasta tierra, así que su voltaje no está definido. ' +
      'En DC un condensador o una fuente de corriente no son un camino. ' +
      `Revisa las conexiones de ${elementos.join(', ')}.`,
    { elementos, nodos: flotantes },
  );
}

function errorSingular(columna: number, ordenNodos: Nodo[], preparados: ElementoPreparado[]): ErrorCircuito {
  let donde = '';
  const nodos: Nodo[] = [];
  const elementos: string[] = [];
  if (columna >= 0 && columna < ordenNodos.length) {
    nodos.push(ordenNodos[columna]!);
    donde = ` cerca del nodo ${ordenNodos[columna]}`;
  } else if (columna >= 0) {
    const p = preparados.find((q) => q.extra === columna);
    if (p) {
      elementos.push(p.elemento.nombre);
      donde = ` en la corriente de ${p.elemento.nombre}`;
    }
  }
  return new ErrorCircuito(
    'matriz_singular',
    `Las ecuaciones del circuito no tienen una solución única${donde}. ` +
      'Suele pasar cuando una fuente controlada depende de su propia salida de forma que la ecuación se anula, ' +
      'o cuando hay valores tan extremos que se cancelan. Revisa las fuentes controladas y los valores muy grandes o muy pequeños.',
    { nodos, elementos },
  );
}
