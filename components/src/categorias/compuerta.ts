/**
 * Categoría "compuerta_logica".
 *
 * El modelo es lógico (tabla de verdad o función estándar) con los niveles
 * eléctricos de la familia. Por ahora se valida el formato y la lógica; la
 * simulación eléctrica llega con la etapa digital (simulación por eventos).
 */

import type { ErrorValidacion } from '../esquema';
import type { Componente, FuncionLogica, ModeloLogico, Prueba, UnidadLogica } from '../formato';
import type { DefinicionCategoria, DefinicionPrueba, ResultadoPrueba } from './tipos';

/** Salida de una función estándar para unas entradas (0/1). */
export function aplicarFuncion(funcion: FuncionLogica, entradas: number[]): number {
  const unos = entradas.filter((e) => e === 1).length;
  switch (funcion) {
    case 'AND':
      return unos === entradas.length ? 1 : 0;
    case 'NAND':
      return unos === entradas.length ? 0 : 1;
    case 'OR':
      return unos > 0 ? 1 : 0;
    case 'NOR':
      return unos > 0 ? 0 : 1;
    case 'XOR':
      return unos % 2;
    case 'XNOR':
      return 1 - (unos % 2);
    case 'NOT':
      return 1 - entradas[0]!;
    case 'BUFFER':
      return entradas[0]!;
  }
}

/** Salida de una unidad (por su función o su tabla) para unas entradas escritas como "01". */
export function evaluarUnidad(unidad: UnidadLogica, entradas: string): number | undefined {
  if (unidad.funcion) return aplicarFuncion(unidad.funcion, [...entradas].map(Number));
  const fila = unidad.tabla?.find((f) => f.split(':')[0] === entradas);
  return fila === undefined ? undefined : Number(fila.split(':')[1]);
}

/** Todas las combinaciones de n entradas: "00", "01", "10", "11"… */
function combinaciones(n: number): string[] {
  return Array.from({ length: 2 ** n }, (_, i) => i.toString(2).padStart(n, '0'));
}

/** Compara filas "entradas:salida" contra el modelo de cada unidad indicada. */
const tablaDeVerdad: DefinicionPrueba = {
  descripcion: 'Tabla de verdad: las filas del datasheet contra el modelo lógico',
  campos: {
    filas: { descripcion: 'Filas "entradas:salida", por ejemplo ["00:1", "11:0"]', obligatorio: true, campo: { tipo: 'filas' } },
    unidad: { descripcion: 'Unidad a probar (1, 2…); por defecto todas', campo: { tipo: 'numero', minimo: 1, maximo: 32 } },
  },
  revisar(prueba, c) {
    if (c.modelo.tipo !== 'logico') return [];
    const n = c.modelo.unidades.length;
    return typeof prueba.unidad === 'number' && prueba.unidad > n ? [`El componente tiene ${n} unidades; no existe la unidad ${prueba.unidad}.`] : [];
  },
  ejecutar(c: Componente, prueba: Prueba): ResultadoPrueba[] {
    if (c.modelo.tipo !== 'logico') return [];
    const modelo: ModeloLogico = c.modelo;
    const indices = typeof prueba.unidad === 'number' ? [prueba.unidad - 1] : modelo.unidades.map((_, i) => i);
    const filas = prueba.filas as string[];
    return indices.map((i) => {
      const unidad = modelo.unidades[i]!;
      const fallas = filas.filter((fila) => {
        const [entradas, salida] = fila.split(':');
        return entradas!.length !== unidad.entradas.length || evaluarUnidad(unidad, entradas!) !== Number(salida);
      });
      return {
        tipo: prueba.tipo,
        descripcion: `Tabla de verdad (unidad ${i + 1}, salida ${unidad.salida})`,
        estado: fallas.length === 0 ? 'pasa' : 'no_pasa',
        esperado: filas.join(' '),
        obtenido: fallas.length === 0 ? 'coincide' : `no coincide en ${fallas.join(' ')}`,
        ...(prueba.fuente ? { fuente: prueba.fuente } : {}),
      };
    });
  },
};

export const categoriaCompuerta: DefinicionCategoria = {
  categoria: 'compuerta_logica',
  nombre: 'compuerta lógica',
  plantillas: {},
  pruebas: { tabla_de_verdad: tablaDeVerdad },
  reglas(c: Componente, errores: ErrorValidacion[]) {
    if (c.modelo.tipo !== 'logico') {
      errores.push({ ruta: 'modelo.tipo', mensaje: 'Una compuerta lógica usa un modelo "logico" (tabla de verdad o función), no un subcircuito.' });
      return;
    }
    const m = c.modelo;
    const nombres = new Set(c.pines.map((p) => p.nombre));
    for (const alimentacion of ['VCC', 'GND']) {
      if (![...nombres].some((n) => n.toUpperCase() === alimentacion)) {
        errores.push({ ruta: 'pines', mensaje: `Falta un pin llamado ${alimentacion}: una compuerta necesita alimentación.` });
      }
    }
    if (!(m.vcc_v > 0 && m.vcc_v <= 20)) errores.push({ ruta: 'modelo.vcc_v', mensaje: `La alimentación debe estar entre 0 y 20 V (recibí ${m.vcc_v} V).` });
    if (!(m.vol_v >= 0 && m.vol_v < m.vil_v && m.vil_v < m.vih_v && m.vih_v < m.voh_v && m.voh_v <= m.vcc_v)) {
      errores.push({
        ruta: 'modelo',
        mensaje: `Los niveles deben cumplir 0 ≤ VOL < VIL < VIH < VOH ≤ VCC; recibí VOL=${m.vol_v}, VIL=${m.vil_v}, VIH=${m.vih_v}, VOH=${m.voh_v}, VCC=${m.vcc_v}.`,
      });
    }
    m.unidades.forEach((u, k) => {
      const ruta = `modelo.unidades[${k}]`;
      for (const pin of [...u.entradas, u.salida]) {
        if (!nombres.has(pin)) errores.push({ ruta, mensaje: `Usa el pin "${pin}", que no está en la lista de pines.` });
      }
      if ((u.funcion === undefined) === (u.tabla === undefined)) {
        errores.push({ ruta, mensaje: 'Indica "funcion" o "tabla", uno de los dos.' });
        return;
      }
      if (u.funcion !== undefined) {
        const una = u.funcion === 'NOT' || u.funcion === 'BUFFER';
        if (una && u.entradas.length !== 1) errores.push({ ruta, mensaje: `${u.funcion} tiene exactamente 1 entrada.` });
        if (!una && u.entradas.length < 2) errores.push({ ruta, mensaje: `${u.funcion} necesita al menos 2 entradas.` });
      }
      if (u.tabla !== undefined) {
        const n = u.entradas.length;
        const vistas = new Set<string>();
        for (const fila of u.tabla) {
          const entradas = fila.split(':')[0]!;
          if (entradas.length !== n) errores.push({ ruta: `${ruta}.tabla`, mensaje: `La fila "${fila}" tiene ${entradas.length} entradas y la unidad tiene ${n}.` });
          else if (vistas.has(entradas)) errores.push({ ruta: `${ruta}.tabla`, mensaje: `La combinación ${entradas} está repetida.` });
          vistas.add(entradas);
        }
        const faltan = combinaciones(n).filter((e) => !vistas.has(e));
        if (faltan.length > 0) errores.push({ ruta: `${ruta}.tabla`, mensaje: `La tabla está incompleta: faltan ${faltan.join(', ')}.` });
      }
    });
  },
  resumen(c) {
    if (c.modelo.tipo !== 'logico') return c.encapsulado;
    const funciones = [...new Set(c.modelo.unidades.map((u) => u.funcion ?? 'tabla'))];
    return `${c.modelo.unidades.length} × ${funciones.join('/')}, ${c.encapsulado}, ${c.modelo.familia}`;
  },
};
