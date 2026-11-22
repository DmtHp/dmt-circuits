/**
 * Categoría "diodo": diodos rectificadores y de señal, LED y zener.
 */

import type { Diodo, Elemento } from '../../../engine/src';
import { corriente, simularDC, voltaje } from '../banco';
import type { ErrorValidacion } from '../esquema';
import type { Componente, Prueba } from '../formato';
import { compararRango, exigirAlgunLimite, fallaPrueba, revisarOrden } from './comun';
import { formatear, type DefinicionCategoria, type DefinicionPrueba } from './tipos';

/** Pines [ánodo, cátodo] de la prueba: los indicados, o los del primer bloque diodo_basico. */
function pinesDelDiodo(c: Componente, prueba: Prueba): [string, string] {
  if (Array.isArray(prueba.pines)) return [prueba.pines[0] as string, prueba.pines[1] as string];
  const bloque = c.modelo.tipo === 'subcircuito' ? c.modelo.bloques?.find((b) => b.usa === 'diodo_basico') : undefined;
  if (!bloque) throw new Error('Indica "pines": [ánodo, cátodo] en la prueba, porque el modelo no usa diodo_basico.');
  return [bloque.pines[0]!, bloque.pines[1]!];
}

const campoPines = {
  descripcion: 'Pines [ánodo, cátodo]; por defecto, los del primer bloque diodo_basico',
  campo: { tipo: 'pines', cantidad: 2 },
} as const;
const camposRango = (unidad: string) =>
  ({
    minimo_v: { descripcion: 'Mínimo del datasheet', unidad, campo: { tipo: 'numero' } },
    maximo_v: { descripcion: 'Máximo del datasheet', unidad, campo: { tipo: 'numero' } },
    tipico_v: { descripcion: 'Típico del datasheet (si no hay mínimo ni máximo)', unidad, campo: { tipo: 'numero' } },
    tolerancia_pct: { descripcion: 'Tolerancia del típico', unidad: '%', campo: { tipo: 'numero', minimo: 0, maximo: 100 } },
  }) as const;

function limites(prueba: Prueba) {
  return {
    ...(typeof prueba.minimo_v === 'number' ? { minimo: prueba.minimo_v } : {}),
    ...(typeof prueba.maximo_v === 'number' ? { maximo: prueba.maximo_v } : {}),
    ...(typeof prueba.tipico_v === 'number' ? { tipico: prueba.tipico_v } : {}),
    ...(typeof prueba.tolerancia_pct === 'number' ? { toleranciaPct: prueba.tolerancia_pct } : {}),
  };
}

/** VF: se hace circular la corriente indicada de ánodo a cátodo y se mide el voltaje. */
const voltajeDirecto: DefinicionPrueba = {
  descripcion: 'Voltaje directo VF a una corriente IF',
  campos: {
    corriente_a: { descripcion: 'Corriente directa IF', unidad: 'A', obligatorio: true, campo: { tipo: 'numero', minimo: 1e-9, maximo: 100 } },
    ...camposRango('V'),
    pines: campoPines,
  },
  revisar: (p) => [...exigirAlgunLimite(p, ['minimo_v', 'maximo_v', 'tipico_v']), ...revisarOrden(p, 'minimo_v', 'maximo_v')],
  ejecutar(c, prueba) {
    const i = prueba.corriente_a as number;
    const descripcion = `Voltaje directo a ${formatear(i, 'A')}`;
    try {
      const [a, k] = pinesDelDiodo(c, prueba);
      const fijos: Elemento[] = [{ tipo: 'fuenteCorriente', nombre: 'IPRUEBA', desde: '0', hacia: 'a', corriente_a: i }];
      const r = simularDC(c, { [a]: 'a', [k]: '0' }, fijos);
      return [compararRango(prueba, descripcion, limites(prueba), voltaje(r, 'a'), 'V')];
    } catch (error) {
      return [fallaPrueba(prueba, descripcion, error)];
    }
  },
};

/** VZ: se hace circular la corriente indicada de cátodo a ánodo (en inversa) y se mide el voltaje. */
const voltajeZener: DefinicionPrueba = {
  descripcion: 'Voltaje zener VZ a una corriente IZ (en inversa)',
  campos: {
    corriente_a: { descripcion: 'Corriente de prueba IZT', unidad: 'A', obligatorio: true, campo: { tipo: 'numero', minimo: 1e-9, maximo: 100 } },
    ...camposRango('V'),
    pines: campoPines,
  },
  revisar: (p) => [...exigirAlgunLimite(p, ['minimo_v', 'maximo_v', 'tipico_v']), ...revisarOrden(p, 'minimo_v', 'maximo_v')],
  ejecutar(c, prueba) {
    const i = prueba.corriente_a as number;
    const descripcion = `Voltaje zener a ${formatear(i, 'A')}`;
    try {
      const [a, k] = pinesDelDiodo(c, prueba);
      const fijos: Elemento[] = [{ tipo: 'fuenteCorriente', nombre: 'IPRUEBA', desde: '0', hacia: 'k', corriente_a: i }];
      const r = simularDC(c, { [a]: '0', [k]: 'k' }, fijos);
      return [compararRango(prueba, descripcion, limites(prueba), voltaje(r, 'k'), 'V')];
    } catch (error) {
      return [fallaPrueba(prueba, descripcion, error)];
    }
  },
};

/** IR: se aplica el voltaje inverso indicado y se mide la corriente de fuga. */
const corrienteInversa: DefinicionPrueba = {
  descripcion: 'Corriente inversa IR a un voltaje VR',
  campos: {
    voltaje_v: { descripcion: 'Voltaje inverso VR', unidad: 'V', obligatorio: true, campo: { tipo: 'numero', minimo: 0, maximo: 5000 } },
    maximo_a: { descripcion: 'Corriente inversa máxima', unidad: 'A', obligatorio: true, campo: { tipo: 'numero', minimo: 0 } },
    pines: campoPines,
  },
  ejecutar(c, prueba) {
    const vr = prueba.voltaje_v as number;
    const descripcion = `Corriente inversa a ${formatear(vr, 'V')}`;
    try {
      const [a, k] = pinesDelDiodo(c, prueba);
      const fijos: Elemento[] = [{ tipo: 'fuenteVoltaje', nombre: 'VPRUEBA', positivo: 'k', negativo: '0', voltaje_v: vr }];
      const r = simularDC(c, { [a]: '0', [k]: 'k' }, fijos);
      return [compararRango(prueba, descripcion, { maximo: prueba.maximo_a as number }, Math.abs(corriente(r, 'VPRUEBA')), 'A')];
    } catch (error) {
      return [fallaPrueba(prueba, descripcion, error)];
    }
  },
};

export const categoriaDiodo: DefinicionCategoria = {
  categoria: 'diodo',
  nombre: 'diodo',
  plantillas: {
    diodo_basico: {
      descripcion: 'Diodo de Shockley con resistencia en serie y ruptura inversa opcional (zener)',
      terminales: ['A', 'K'],
      parametros: {
        is_a: { unidad: 'A', descripcion: 'Corriente de saturación Is', defecto: 1e-14, minimo: 1e-24, maximo: 1e-3 },
        n: { unidad: '', descripcion: 'Coeficiente de emisión', defecto: 1, minimo: 0.5, maximo: 4 },
        rs_ohm: { unidad: 'Ω', descripcion: 'Resistencia en serie', defecto: 0, minimo: 0, maximo: 1000 },
        bv_v: { unidad: 'V', descripcion: 'Voltaje de ruptura inversa (zener)', minimo: 0.1, maximo: 5000, opcional: true },
        ibv_a: { unidad: 'A', descripcion: 'Corriente en el voltaje de ruptura', defecto: 1e-3, minimo: 1e-9, maximo: 10 },
        corriente_maxima_a: { unidad: 'A', descripcion: 'Corriente máxima permitida (para avisos; no cambia el modelo)', minimo: 1e-6, maximo: 1000, opcional: true },
      },
      construir(p, [a, k], v) {
        const diodo: Diodo = {
          tipo: 'diodo',
          nombre: `${p}D`,
          anodo: v.rs_ohm! > 0 ? `${p}j` : a!,
          catodo: k!,
          corrienteSaturacion_a: v.is_a!,
          coeficienteEmision: v.n!,
        };
        if (v.bv_v !== undefined) {
          diodo.ruptura_v = v.bv_v;
          diodo.corrienteRuptura_a = v.ibv_a!;
        }
        const elementos: Elemento[] = [diodo];
        if (v.rs_ohm! > 0) elementos.push({ tipo: 'resistencia', nombre: `${p}RS`, a: a!, b: `${p}j`, resistencia_ohm: v.rs_ohm! });
        return elementos;
      },
    },
  },
  pruebas: {
    voltaje_directo: voltajeDirecto,
    voltaje_zener: voltajeZener,
    corriente_inversa: corrienteInversa,
  },
  reglas(c: Componente, errores: ErrorValidacion[]) {
    if (c.pines.length < 2) errores.push({ ruta: 'pines', mensaje: 'Un diodo necesita al menos 2 pines (ánodo y cátodo).' });
  },
  resumen(c) {
    // Para un zener se muestra el voltaje nominal de su prueba (el del datasheet), no el parámetro interno del modelo.
    const prueba = c.pruebas.find((p) => p.tipo === 'voltaje_zener');
    let nominal: number | undefined;
    if (prueba) {
      const { minimo_v: min, maximo_v: max, tipico_v: tip } = prueba as { minimo_v?: number; maximo_v?: number; tipico_v?: number };
      nominal = tip ?? (min !== undefined && max !== undefined ? (min + max) / 2 : (min ?? max));
    }
    return `${prueba ? `zener${nominal !== undefined ? ` de ${Number(nominal.toPrecision(3))} V` : ''}, ` : ''}${c.encapsulado}`;
  },
};
