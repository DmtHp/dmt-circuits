/**
 * El "cerebro" del botón Crear componente: recibe el texto (o el objeto) y lo
 * pasa por los tres filtros.
 *
 *   1. Formato: ¿es JSON?, ¿tiene la estructura del formato 1.0?
 *   2. Reglas de la categoría: pines, encapsulado, plantillas, parámetros y
 *      campos de las pruebas, con rangos físicos.
 *   3. Prueba eléctrica: cada prueba arma un circuito con el motor y compara
 *      contra el datasheet.
 *
 * Si un filtro falla, los siguientes no se evalúan. Cada error trae la ruta
 * del campo y un mensaje en español, y `textoParaIA` los junta listos para
 * copiar a la IA que generó el archivo.
 */

import { ErrorCircuito, leerNetlist } from '../../engine/src';
import { CATEGORIAS_DEFINIDAS, obtenerCategoria, type DefinicionCategoria, type ResultadoPrueba } from './categorias';
import type { DefCampoPrueba } from './categorias/tipos';
import { detectarCategoria } from './detectar';
import { esObjeto, sugerir, tipoDe, validarEsquema, type ErrorValidacion } from './esquema';
import { ErrorExpresion, valorDe, type NumeroOExpresion } from './expresiones';
import { ESQUEMA_COMPONENTE, type Categoria, type Componente, type Prueba } from './formato';

export type EstadoFiltro = 'pasa' | 'no_pasa' | 'no_evaluado';

export interface ResultadoFiltro {
  estado: EstadoFiltro;
  errores: ErrorValidacion[];
}

export interface ResultadoValidacion {
  aceptado: boolean;
  /** El componente, si pasó al menos el filtro 1. */
  componente?: Componente;
  categoria?: Categoria;
  /** true si la categoría no venía en el archivo y se dedujo. */
  categoriaDetectada: boolean;
  /** Categorías posibles cuando no se pudo decidir. */
  candidatas: Categoria[];
  /** Texto para la tarjeta de confirmación: "Detecté: amplificador operacional, 2 unidades, DIP-8". */
  resumen?: string;
  filtros: {
    formato: ResultadoFiltro;
    categoria: ResultadoFiltro;
    electrico: ResultadoFiltro & { pruebas: ResultadoPrueba[]; nota?: string };
  };
  /** Cosas que no impiden aceptar el componente pero conviene saber. */
  avisos: string[];
  /** Si no fue aceptado: los errores, listos para pegarle a la IA. */
  textoParaIA?: string;
}

/** Tamaño máximo del archivo: un componente real ocupa unos pocos KB. */
export const TAMANO_MAXIMO_BYTES = 256 * 1024;

const CAMPOS_COMUNES_PRUEBA = ['tipo', 'fuente', 'descripcion'];

export function validarComponente(entrada: unknown): ResultadoValidacion {
  const resultado: ResultadoValidacion = {
    aceptado: false,
    categoriaDetectada: false,
    candidatas: [],
    filtros: {
      formato: { estado: 'no_evaluado', errores: [] },
      categoria: { estado: 'no_evaluado', errores: [] },
      electrico: { estado: 'no_evaluado', errores: [], pruebas: [] },
    },
    avisos: [],
  };
  const fallarFormato = (errores: ErrorValidacion[]): ResultadoValidacion => {
    resultado.filtros.formato = { estado: 'no_pasa', errores };
    resultado.textoParaIA = textoParaIA(resultado);
    return resultado;
  };

  // --- Filtro 1: formato ---
  let dato: unknown = entrada;
  if (typeof entrada === 'string') {
    const leido = leerJSON(entrada);
    if ('error' in leido) return fallarFormato([{ ruta: '', mensaje: leido.error }]);
    dato = leido.dato;
  }
  if (!esObjeto(dato)) {
    return fallarFormato([{ ruta: '', mensaje: `Un componente es un objeto JSON { … } y esto es ${tipoDe(dato)}.` }]);
  }

  // Categoría: la declarada o, si falta o no existe, la detectada.
  const declarada = dato.categoria;
  if (typeof declarada !== 'string' || !(declarada in CATEGORIAS_DEFINIDAS)) {
    const deteccion = detectarCategoria(dato);
    resultado.candidatas = deteccion.candidatas;
    if (deteccion.categoria && declarada === undefined) {
      dato = { ...dato, categoria: deteccion.categoria };
      resultado.categoriaDetectada = true;
      resultado.avisos.push(
        `El archivo no declara su categoría; detecté "${CATEGORIAS_DEFINIDAS[deteccion.categoria].nombre}" porque ${deteccion.razon}. ` +
          `Conviene agregar "categoria": "${deteccion.categoria}".`,
      );
    }
  }

  const erroresFormato = validarEsquema(dato, ESQUEMA_COMPONENTE);
  if (erroresFormato.length > 0) return fallarFormato(erroresFormato);
  resultado.filtros.formato.estado = 'pasa';
  const componente = dato as unknown as Componente;
  resultado.componente = componente;
  resultado.categoria = componente.categoria;
  const definicion = obtenerCategoria(componente.categoria);
  resultado.resumen = `Detecté: ${definicion.nombre}, ${definicion.resumen(componente)}`;

  // --- Filtro 2: reglas de la categoría ---
  const erroresReglas: ErrorValidacion[] = [];
  reglasComunes(componente, definicion, erroresReglas, resultado.avisos);
  definicion.reglas(componente, erroresReglas);
  revisarPruebas(componente, definicion, erroresReglas);
  if (erroresReglas.length > 0) {
    resultado.filtros.categoria = { estado: 'no_pasa', errores: erroresReglas };
    resultado.textoParaIA = textoParaIA(resultado);
    return resultado;
  }
  resultado.filtros.categoria.estado = 'pasa';

  // --- Filtro 3: prueba eléctrica ---
  const pruebas: ResultadoPrueba[] = [];
  for (const prueba of componente.pruebas) {
    const def = definicion.pruebas[prueba.tipo]!;
    try {
      pruebas.push(...def.ejecutar(componente, prueba));
    } catch (error) {
      pruebas.push({ tipo: prueba.tipo, descripcion: def.descripcion, estado: 'error', esperado: '-', obtenido: error instanceof Error ? error.message : String(error) });
    }
  }
  const fallidas = pruebas.filter((p) => p.estado === 'no_pasa' || p.estado === 'error');
  resultado.filtros.electrico = {
    estado: fallidas.length === 0 ? 'pasa' : 'no_pasa',
    pruebas,
    errores: fallidas.map((p) => ({
      ruta: `pruebas (${p.tipo})`,
      mensaje: `${p.descripcion}: esperaba ${p.esperado} y dio ${p.obtenido}.${p.fuente ? ` Fuente: ${p.fuente}.` : ''}`,
    })),
  };
  if (componente.categoria === 'compuerta_logica') {
    resultado.filtros.electrico.nota = 'Se comprobó la lógica. La simulación eléctrica de compuertas llega con la etapa digital.';
  } else if (componente.pruebas.length === 0) {
    resultado.filtros.electrico.nota = 'El componente no trae pruebas: se aceptó por ser de fidelidad ideal.';
  }

  resultado.aceptado = fallidas.length === 0;
  if (!resultado.aceptado) resultado.textoParaIA = textoParaIA(resultado);
  return resultado;
}

function leerJSON(texto: string): { dato: unknown } | { error: string } {
  if (texto.length > TAMANO_MAXIMO_BYTES) {
    return { error: `El archivo es demasiado grande (${Math.round(texto.length / 1024)} KB). Un componente ocupa unos pocos KB.` };
  }
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (limpio === '') return { error: 'El texto está vacío.' };
  try {
    return { dato: JSON.parse(limpio) as unknown };
  } catch (error) {
    if (/^\s*(import |from \S+ import|def |class |function |const |let |var |#include|print\(|public |using )/m.test(limpio)) {
      return {
        error:
          'Esto parece un programa (código de Python, JavaScript u otro lenguaje), no un archivo de componente. ' +
          'Un componente es un archivo JSON de datos que describe pines, modelo y pruebas, sin código ejecutable.',
      };
    }
    return { error: `No es un JSON válido: ${error instanceof Error ? error.message : String(error)}. Revisa comas, comillas y llaves.` };
  }
}

/** Cantidad de pines que corresponde a un encapsulado, o null si no lo conozco. */
export function pinesDeEncapsulado(encapsulado: string): number | null {
  const e = encapsulado.trim().toUpperCase();
  const conNumero = /^(DIP|PDIP|SOIC|SOP|SSOP|TSSOP|MSOP|QFN|SIP)-(\d+)$/.exec(e);
  if (conNumero) return Number(conNumero[2]);
  const sot = /^SOT-23-(\d)$/.exec(e);
  if (sot) return Number(sot[1]);
  const to220 = /^TO-220-(\d)$/.exec(e);
  if (to220) return Number(to220[1]);
  if (['SOT-23', 'TO-92', 'TO-220', 'TO-126'].includes(e)) return 3;
  if (['DO-35', 'DO-41', 'DO-15', 'DO-201', 'SOD-123', 'SOD-323', 'SMA', 'SMB', 'AXIAL', 'RADIAL', 'LED-3MM', 'LED-5MM', '0402', '0603', '0805', '1206'].includes(e)) {
    return 2;
  }
  return null;
}

function reglasComunes(c: Componente, def: DefinicionCategoria, errores: ErrorValidacion[], avisos: string[]): void {
  // Pines numerados 1..N sin huecos ni repetidos, con nombres únicos.
  const numeros = c.pines.map((p) => p.n);
  const repetidoN = numeros.find((n, i) => numeros.indexOf(n) !== i);
  if (repetidoN !== undefined) errores.push({ ruta: 'pines', mensaje: `El pin número ${repetidoN} está repetido.` });
  const faltantes = Array.from({ length: c.pines.length }, (_, i) => i + 1).filter((n) => !numeros.includes(n));
  if (repetidoN === undefined && faltantes.length > 0) {
    errores.push({ ruta: 'pines', mensaje: `Los pines deben numerarse de 1 a ${c.pines.length} sin saltos; falta el ${faltantes.join(', ')}.` });
  }
  const nombres = c.pines.map((p) => p.nombre.toUpperCase());
  const repetidoNombre = c.pines.find((p, i) => nombres.indexOf(p.nombre.toUpperCase()) !== i);
  if (repetidoNombre) errores.push({ ruta: 'pines', mensaje: `El nombre de pin "${repetidoNombre.nombre}" está repetido.` });

  // Encapsulado.
  const esperados = pinesDeEncapsulado(c.encapsulado);
  if (esperados === null) {
    errores.push({
      ruta: 'encapsulado',
      mensaje: `No conozco el encapsulado "${c.encapsulado}". Usa uno como DIP-8, DIP-14, SOIC-8, TO-92, SOT-23, DO-35, DO-41, axial, radial o LED-5mm.`,
    });
  } else if (esperados !== c.pines.length) {
    errores.push({ ruta: 'encapsulado', mensaje: `${c.encapsulado} tiene ${esperados} pines, pero la lista de pines tiene ${c.pines.length}.` });
  }

  // Fidelidad y fuentes.
  if (c.fidelidad === 'fabricante' && !c.datasheet) {
    errores.push({ ruta: 'datasheet', mensaje: 'Un modelo de fabricante debe indicar el enlace al datasheet o al modelo original.' });
  }
  if (c.fidelidad !== 'ideal') {
    if (c.pruebas.length === 0) {
      errores.push({ ruta: 'pruebas', mensaje: `Un componente de fidelidad "${c.fidelidad}" necesita al menos una prueba con valores del datasheet.` });
    }
    c.pruebas.forEach((p, i) => {
      if (!p.fuente) errores.push({ ruta: `pruebas[${i}].fuente`, mensaje: 'Indica de dónde sale el valor esperado (datasheet, tabla, página).' });
    });
  }

  // Modelo.
  if (c.modelo.tipo === 'logico') {
    if (c.categoria !== 'compuerta_logica') {
      errores.push({ ruta: 'modelo.tipo', mensaje: `El modelo "logico" es solo para compuertas; un ${def.nombre} usa "subcircuito".` });
    }
    return;
  }
  const modelo = c.modelo;
  const bloques = modelo.bloques ?? [];
  const lineas = modelo.netlist ?? [];
  if (bloques.length === 0 && lineas.length === 0) {
    errores.push({ ruta: 'modelo', mensaje: 'El modelo está vacío: agrega "bloques" (plantillas de la categoría) o líneas de "netlist".' });
  }
  const pinesConocidos = new Set(c.pines.map((p) => p.nombre));
  const pinesUsados = new Set<string>();

  bloques.forEach((bloque, k) => {
    const ruta = `modelo.bloques[${k}]`;
    const plantilla = def.plantillas[bloque.usa];
    if (!plantilla) {
      const opciones = Object.keys(def.plantillas);
      const parecida = sugerir(bloque.usa, opciones);
      errores.push({
        ruta: `${ruta}.usa`,
        mensaje:
          `La categoría ${def.nombre} no tiene la plantilla "${bloque.usa}".` +
          (opciones.length > 0 ? ` Opciones: ${opciones.join(', ')}.` : '') +
          (parecida ? ` ¿Quisiste decir "${parecida}"?` : ''),
      });
      return;
    }
    if (bloque.pines.length !== plantilla.terminales.length) {
      errores.push({
        ruta: `${ruta}.pines`,
        mensaje: `${bloque.usa} conecta ${plantilla.terminales.length} terminales (${plantilla.terminales.join(', ')}) y se dieron ${bloque.pines.length} pines.`,
      });
    }
    bloque.pines.forEach((pin, i) => {
      pinesUsados.add(pin);
      if (!pinesConocidos.has(pin)) {
        errores.push({ ruta: `${ruta}.pines[${i}]`, mensaje: `El pin "${pin}" no está en la lista de pines.` + sugerencia(pin, [...pinesConocidos]) });
      }
    });
    const parametros = bloque.parametros ?? {};
    for (const [nombre, valor] of Object.entries(parametros)) {
      const defParametro = plantilla.parametros[nombre];
      if (!defParametro) {
        errores.push({
          ruta: `${ruta}.parametros.${nombre}`,
          mensaje: `${bloque.usa} no tiene el parámetro "${nombre}".` + sugerencia(nombre, Object.keys(plantilla.parametros), ` Parámetros: ${Object.keys(plantilla.parametros).join(', ')}.`),
        });
        continue;
      }
      revisarNumero(valor, {}, `${ruta}.parametros.${nombre}`, defParametro.minimo, defParametro.maximo, defParametro.unidad, errores);
    }
    for (const [nombre, defParametro] of Object.entries(plantilla.parametros)) {
      if (defParametro.defecto === undefined && !defParametro.opcional && !(nombre in parametros)) {
        errores.push({ ruta: `${ruta}.parametros`, mensaje: `Falta el parámetro "${nombre}" (${defParametro.descripcion}, en ${defParametro.unidad || 'sin unidad'}).` });
      }
    }
  });

  if (lineas.length > 0) {
    lineas.forEach((linea, i) => {
      try {
        leerNetlist(linea);
      } catch (error) {
        const mensaje = error instanceof ErrorCircuito ? error.message.replace(/^Línea 1 /, '') : String(error);
        errores.push({ ruta: `modelo.netlist[${i}]`, mensaje });
      }
      for (const palabra of linea.split(/[\s=()]+/)) if (pinesConocidos.has(palabra)) pinesUsados.add(palabra);
    });
  }

  const sinUsar = c.pines.filter((p) => !pinesUsados.has(p.nombre) && !/^NC\d*$/i.test(p.nombre)).map((p) => p.nombre);
  if (sinUsar.length > 0) avisos.push(`El modelo no usa los pines ${sinUsar.join(', ')}. Si son "sin conexión", llámalos NC.`);
}

function sugerencia(nombre: string, conocidos: string[], siNo = ''): string {
  const parecido = sugerir(nombre, conocidos);
  return parecido ? ` ¿Quisiste decir "${parecido}"?` : siNo;
}

function revisarNumero(
  valor: NumeroOExpresion,
  variables: Record<string, number>,
  ruta: string,
  minimo: number | undefined,
  maximo: number | undefined,
  unidad: string,
  errores: ErrorValidacion[],
): void {
  let numero: number;
  try {
    numero = valorDe(valor, variables);
  } catch (error) {
    errores.push({ ruta, mensaje: error instanceof ErrorExpresion ? error.message : String(error) });
    return;
  }
  const u = unidad ? ` ${unidad}` : '';
  if (minimo !== undefined && numero < minimo) errores.push({ ruta, mensaje: `Vale ${numero}${u}; el mínimo razonable es ${minimo}${u}.` });
  if (maximo !== undefined && numero > maximo) errores.push({ ruta, mensaje: `Vale ${numero}${u}; el máximo razonable es ${maximo}${u}.` });
}

function revisarPruebas(c: Componente, def: DefinicionCategoria, errores: ErrorValidacion[]): void {
  const pines = new Set(c.pines.map((p) => p.nombre));
  c.pruebas.forEach((prueba: Prueba, i) => {
    const ruta = `pruebas[${i}]`;
    const defPrueba = def.pruebas[prueba.tipo];
    if (!defPrueba) {
      const opciones = Object.keys(def.pruebas);
      errores.push({
        ruta: `${ruta}.tipo`,
        mensaje: `La categoría ${def.nombre} no tiene la prueba "${prueba.tipo}". Opciones: ${opciones.join(', ')}.` + sugerencia(prueba.tipo, opciones),
      });
      return;
    }
    const conocidos = [...CAMPOS_COMUNES_PRUEBA, ...Object.keys(defPrueba.campos)];
    for (const campo of Object.keys(prueba)) {
      if (!conocidos.includes(campo)) {
        errores.push({ ruta: `${ruta}.${campo}`, mensaje: `La prueba ${prueba.tipo} no usa este campo.` + sugerencia(campo, conocidos, ` Campos: ${conocidos.join(', ')}.`) });
      }
    }
    const variables = Object.fromEntries((defPrueba.variables ?? []).map((v) => [v, 1]));
    for (const [campo, defCampo] of Object.entries(defPrueba.campos)) {
      const valor = prueba[campo];
      if (valor === undefined) {
        if (defCampo.obligatorio) errores.push({ ruta: `${ruta}.${campo}`, mensaje: `Falta este campo: ${defCampo.descripcion}${defCampo.unidad ? ` (en ${defCampo.unidad})` : ''}.` });
        continue;
      }
      revisarCampo(valor, defCampo, `${ruta}.${campo}`, variables, pines, errores);
    }
    if (defPrueba.revisar) {
      for (const mensaje of defPrueba.revisar(prueba, c)) errores.push({ ruta, mensaje });
    }
  });
}

function revisarCampo(
  valor: unknown,
  def: DefCampoPrueba,
  ruta: string,
  variables: Record<string, number>,
  pines: Set<string>,
  errores: ErrorValidacion[],
): void {
  const campo = def.campo;
  switch (campo.tipo) {
    case 'numero':
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        errores.push({ ruta, mensaje: `Debe ser un número y es ${tipoDe(valor)}.` });
      } else {
        revisarNumero(valor, {}, ruta, campo.minimo, campo.maximo, def.unidad ?? '', errores);
      }
      return;
    case 'numeroOExpresion':
      if (typeof valor !== 'number' && typeof valor !== 'string') {
        errores.push({ ruta, mensaje: `Debe ser un número o una expresión de texto y es ${tipoDe(valor)}.` });
      } else {
        revisarNumero(valor, variables, ruta, undefined, undefined, '', errores);
      }
      return;
    case 'opcion':
      if (typeof valor !== 'string' || !campo.valores.includes(valor)) {
        errores.push({ ruta, mensaje: `Debe ser uno de: ${campo.valores.join(', ')}.` });
      }
      return;
    case 'pines':
      if (!Array.isArray(valor) || valor.length !== campo.cantidad || !valor.every((v) => typeof v === 'string')) {
        errores.push({ ruta, mensaje: `Debe ser una lista de ${campo.cantidad} nombres de pin.` });
      } else {
        for (const pin of valor as string[]) {
          if (!pines.has(pin)) errores.push({ ruta, mensaje: `El pin "${pin}" no está en la lista de pines.` + sugerencia(pin, [...pines]) });
        }
      }
      return;
    case 'filas':
      if (!Array.isArray(valor) || valor.length === 0 || !valor.every((v) => typeof v === 'string' && /^[01]+:[01]$/.test(v))) {
        errores.push({ ruta, mensaje: 'Debe ser una lista de filas "entradas:salida" con ceros y unos, por ejemplo ["00:1", "11:0"].' });
      }
      return;
  }
}

/** Junta los errores en un texto para pegarle a la IA que generó el archivo. */
function textoParaIA(r: ResultadoValidacion): string {
  const errores = [...r.filtros.formato.errores, ...r.filtros.categoria.errores, ...r.filtros.electrico.errores];
  const id = r.componente?.id ? ` "${r.componente.id}"` : '';
  const lineas = errores.map((e, i) => `${i + 1}. ${e.ruta ? `[${e.ruta}] ` : ''}${e.mensaje}`);
  const electrico = r.filtros.electrico.estado === 'no_pasa';
  return [
    `El archivo de componente${id} no pasó la validación de DMT Circuits (formato 1.0).`,
    electrico
      ? 'El modelo no se comporta como dice el datasheet. Ajusta los parámetros del modelo (no los valores esperados, que salen del datasheet) y devuelve el JSON completo corregido:'
      : 'Corrige estos puntos y devuelve el JSON completo corregido:',
    ...lineas,
  ].join('\n');
}
