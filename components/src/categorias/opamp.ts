/**
 * Categoría "amplificador_operacional".
 *
 * Plantilla opamp_basico (macromodelo de comportamiento), por unidad:
 *
 *   IN+ ─┬─────────────┐
 *        RIN        [ASR] limitador: copia vd = V(IN+) − V(IN−) hasta ±Vs   → nodo s
 *   IN− ─┴─────────────┘
 *        s ──[GM]──► corriente gm·V(s) hacia el nodo x
 *        x ── R1 ‖ C1 a tierra      (un polo: la ganancia cae 20 dB/década)
 *        x ── diodos a V+ y V−      (que x no se aleje de la alimentación al saturar)
 *        x ──[AOUT] limitador con topes V− + margen_bajo y V+ − margen_alto → nodo o
 *        o ── ROUT ── OUT
 *
 * Cómo salen los valores (R1 se fija en 1 MΩ):
 *   - Ganancia DC:  A0 = gm·R1                       → gm = A0 / R1
 *   - Polo:         fp = 1/(2π·R1·C1) = GBW / A0      → C1 = A0 / (2π·GBW·R1)
 *   - Slew rate:    la corriente máxima hacia C1 es gm·Vs, así que SR = gm·Vs / C1 = 2π·GBW·Vs
 *                   → Vs = SR / (2π·GBW)
 * Con vd chico (|vd| < Vs) el op-amp es lineal; con vd grande la corriente se
 * limita y la salida sube a velocidad constante: eso es el slew rate.
 */

import type { Elemento } from '../../../engine/src';
import { cruce, simularDC, simularTransitorio, voltaje } from '../banco';
import type { ErrorValidacion } from '../esquema';
import { valorDe } from '../expresiones';
import type { Componente, Prueba } from '../formato';
import { compararAbsoluto, compararPorcentaje, compararRango, fallaPrueba, revisarOrden } from './comun';
import { formatear, type DefCampoPrueba, type DefinicionCategoria, type DefinicionPrueba, type ResultadoPrueba } from './tipos';

const R1_OHM = 1e6;
const TERMINALES = ['IN+', 'IN-', 'OUT', 'V+', 'V-'];

/** Unidades a probar: los pines indicados en la prueba, o cada bloque opamp_basico. */
function unidades(c: Componente, prueba: Prueba): string[][] {
  if (Array.isArray(prueba.pines)) return [prueba.pines as string[]];
  const bloques = c.modelo.tipo === 'subcircuito' ? (c.modelo.bloques ?? []).filter((b) => b.usa === 'opamp_basico') : [];
  if (bloques.length === 0) throw new Error('Indica "pines": [IN+, IN-, OUT, V+, V-] en la prueba, porque el modelo no usa opamp_basico.');
  return bloques.map((b) => b.pines);
}

interface Alimentacion {
  vcc: number;
  vee: number;
  variables: Record<string, number>;
  fijos: Elemento[];
}

function alimentacion(prueba: Prueba): Alimentacion {
  const vcc = prueba.alimentacion_v as number;
  const vee = (prueba.alimentacion_negativa_v as number | undefined) ?? 0;
  const fijos: Elemento[] = [{ tipo: 'fuenteVoltaje', nombre: 'VCC', positivo: 'vcc', negativo: '0', voltaje_v: vcc }];
  if (vee !== 0) fijos.push({ tipo: 'fuenteVoltaje', nombre: 'VEE', positivo: 'vee', negativo: '0', voltaje_v: vee });
  return { vcc, vee, variables: { VCC: vcc, VEE: vee, GND: 0 }, fijos };
}

/** Conexiones de una unidad: IN+, IN−, OUT a los nodos dados y la alimentación a vcc/vee. */
function conectar(pines: string[], vee: number, inPositiva: string, inNegativa: string, salida: string): Record<string, string> {
  const [ip, im, out, vp, vm] = pines;
  return { [ip!]: inPositiva, [im!]: inNegativa, [out!]: salida, [vp!]: 'vcc', [vm!]: vee !== 0 ? 'vee' : '0' };
}

/** Valor de un parámetro en el primer bloque opamp_basico (para escalas de tiempo). */
function parametroBloque(c: Componente, nombre: string): number | undefined {
  const bloque = c.modelo.tipo === 'subcircuito' ? c.modelo.bloques?.find((b) => b.usa === 'opamp_basico') : undefined;
  const crudo = bloque?.parametros?.[nombre];
  return crudo === undefined ? undefined : valorDe(crudo);
}

const camposAlimentacion: Record<string, DefCampoPrueba> = {
  alimentacion_v: { descripcion: 'Voltaje de alimentación positiva (VCC)', unidad: 'V', obligatorio: true, campo: { tipo: 'numero', minimo: 0.5, maximo: 50 } },
  alimentacion_negativa_v: { descripcion: 'Alimentación negativa (VEE); 0 o ausente = una sola fuente', unidad: 'V', campo: { tipo: 'numero', minimo: -50, maximo: 0 } },
  pines: { descripcion: 'Pines [IN+, IN-, OUT, V+, V-]; por defecto, cada bloque opamp_basico', campo: { tipo: 'pines', cantidad: 5 } },
};

function revisarAlimentacion(prueba: Prueba, c: Componente): string[] {
  const vcc = prueba.alimentacion_v;
  const vee = prueba.alimentacion_negativa_v ?? 0;
  const maximo = parametroBloque(c, 'alimentacion_maxima_v');
  if (typeof vcc === 'number' && typeof vee === 'number' && maximo !== undefined && vcc - vee > maximo) {
    return [`La alimentación total (${vcc - vee} V) supera el máximo del componente (${maximo} V).`];
  }
  return [];
}

function porUnidad(c: Componente, prueba: Prueba, nombre: string, medir: (pines: string[], descripcion: string) => ResultadoPrueba): ResultadoPrueba[] {
  let lista: string[][];
  try {
    lista = unidades(c, prueba);
  } catch (error) {
    return [fallaPrueba(prueba, nombre, error)];
  }
  return lista.map((pines, k) => {
    const descripcion = lista.length > 1 ? `${nombre} (unidad ${k + 1})` : nombre;
    try {
      return medir(pines, descripcion);
    } catch (error) {
      return fallaPrueba(prueba, descripcion, error);
    }
  });
}

/** Seguidor de voltaje: OUT unida a IN−; la salida debe copiar la entrada. */
const seguidor: DefinicionPrueba = {
  descripcion: 'Seguidor de voltaje: la salida copia la entrada',
  campos: {
    ...camposAlimentacion,
    entrada_v: { descripcion: 'Voltaje en IN+', unidad: 'V', obligatorio: true, campo: { tipo: 'numeroOExpresion' } },
    tolerancia_v: { descripcion: 'Diferencia aceptada', unidad: 'V', campo: { tipo: 'numero', minimo: 0 } },
  },
  variables: ['VCC', 'VEE', 'GND'],
  revisar: revisarAlimentacion,
  ejecutar(c, prueba) {
    const { vee, variables, fijos } = alimentacion(prueba);
    const entrada = valorDe(prueba.entrada_v as number | string, variables);
    return porUnidad(c, prueba, `Seguidor de voltaje con ${formatear(entrada, 'V')}`, (pines, descripcion) => {
      const r = simularDC(c, conectar(pines, vee, 'in', 'out', 'out'), [
        ...fijos,
        { tipo: 'fuenteVoltaje', nombre: 'VIN', positivo: 'in', negativo: '0', voltaje_v: entrada },
      ]);
      return compararAbsoluto(prueba, descripcion, entrada, voltaje(r, 'out'), (prueba.tolerancia_v as number | undefined) ?? 0.01, 'V');
    });
  },
};

/** Saturación: lazo abierto con 0.5 V de diferencia entre entradas; la salida va a su tope. */
const saturacion: DefinicionPrueba = {
  descripcion: 'Voltaje de salida saturada (alto o bajo)',
  campos: {
    ...camposAlimentacion,
    lado: { descripcion: '"alto" o "bajo"', obligatorio: true, campo: { tipo: 'opcion', valores: ['alto', 'bajo'] } },
    esperado_v: { descripcion: 'Voltaje esperado, por ejemplo "VCC - 1.5"', unidad: 'V', obligatorio: true, campo: { tipo: 'numeroOExpresion' } },
    tolerancia_v: { descripcion: 'Diferencia aceptada', unidad: 'V', campo: { tipo: 'numero', minimo: 0 } },
  },
  variables: ['VCC', 'VEE', 'GND'],
  revisar: revisarAlimentacion,
  ejecutar(c, prueba) {
    const { vcc, vee, variables, fijos } = alimentacion(prueba);
    const esperado = valorDe(prueba.esperado_v as number | string, variables);
    const alto = prueba.lado === 'alto';
    const medio = (vcc + vee) / 2;
    return porUnidad(c, prueba, `Salida saturada ${alto ? 'alta' : 'baja'} con VCC = ${formatear(vcc, 'V')}`, (pines, descripcion) => {
      const r = simularDC(c, conectar(pines, vee, 'p', 'm', 'out'), [
        ...fijos,
        { tipo: 'fuenteVoltaje', nombre: 'VP', positivo: 'p', negativo: '0', voltaje_v: medio + (alto ? 0.5 : -0.5) },
        { tipo: 'fuenteVoltaje', nombre: 'VM', positivo: 'm', negativo: '0', voltaje_v: medio },
      ]);
      return compararAbsoluto(prueba, descripcion, esperado, voltaje(r, 'out'), (prueba.tolerancia_v as number | undefined) ?? 0.1, 'V');
    });
  },
};

/**
 * Slew rate: seguidor con un escalón grande (30 % de la alimentación).
 * Se mide la pendiente entre el 20 % y el 80 % del escalón: SR = 0.6·ΔV / (t80 − t20).
 */
const slewRate: DefinicionPrueba = {
  descripcion: 'Slew rate: velocidad máxima de la salida ante un escalón grande',
  campos: {
    ...camposAlimentacion,
    minimo_v_us: { descripcion: 'Mínimo', unidad: 'V/µs', campo: { tipo: 'numero', minimo: 0 } },
    maximo_v_us: { descripcion: 'Máximo', unidad: 'V/µs', campo: { tipo: 'numero', minimo: 0 } },
    tipico_v_us: { descripcion: 'Típico', unidad: 'V/µs', campo: { tipo: 'numero', minimo: 0 } },
    tolerancia_pct: { descripcion: 'Tolerancia del típico', unidad: '%', campo: { tipo: 'numero', minimo: 0, maximo: 100 } },
  },
  revisar: (p, c) => [
    ...(['minimo_v_us', 'maximo_v_us', 'tipico_v_us'].some((k) => p[k] !== undefined) ? [] : ['Indica al menos uno de: minimo_v_us, maximo_v_us, tipico_v_us.']),
    ...revisarOrden(p, 'minimo_v_us', 'maximo_v_us'),
    ...revisarAlimentacion(p, c),
  ],
  ejecutar(c, prueba) {
    const { vcc, vee, fijos } = alimentacion(prueba);
    const referencia =
      (prueba.tipico_v_us as number | undefined) ??
      (prueba.maximo_v_us as number | undefined) ??
      (prueba.minimo_v_us as number | undefined) ??
      parametroBloque(c, 'slew_v_us') ??
      1;
    const salto = 0.3 * (vcc - vee);
    const bajo = (vcc + vee) / 2 - salto / 2;
    const tSubida = salto / (referencia * 1e6);
    const retardo = 0.5 * tSubida;
    return porUnidad(c, prueba, `Slew rate con VCC = ${formatear(vcc, 'V')}`, (pines, descripcion) => {
      const r = simularTransitorio(
        c,
        conectar(pines, vee, 'in', 'out', 'out'),
        [
          ...fijos,
          {
            tipo: 'fuenteVoltaje',
            nombre: 'VIN',
            positivo: 'in',
            negativo: '0',
            voltaje_v: bajo,
            forma: { tipo: 'pulso', inicial: bajo, pulsado: bajo + salto, retardo_s: retardo, subida_s: tSubida / 1000, bajada_s: tSubida / 1000, ancho_s: 100 * tSubida, periodo_s: 200 * tSubida },
          },
        ],
        { tiempoFinal_s: retardo + 4 * tSubida, pasoMaximo_s: tSubida / 100 },
      );
      const salida = r.voltajes.get('out')!;
      const t20 = cruce(r.tiempos, salida, bajo + 0.2 * salto, retardo);
      const t80 = cruce(r.tiempos, salida, bajo + 0.8 * salto, retardo);
      if (t20 === null || t80 === null) throw new Error('La salida no siguió el escalón: revisa la ganancia y el slew rate del modelo.');
      const medido = (0.6 * salto) / (t80 - t20) / 1e6;
      return compararRango(
        prueba,
        descripcion,
        {
          ...(prueba.minimo_v_us !== undefined ? { minimo: prueba.minimo_v_us as number } : {}),
          ...(prueba.maximo_v_us !== undefined ? { maximo: prueba.maximo_v_us as number } : {}),
          ...(prueba.tipico_v_us !== undefined ? { tipico: prueba.tipico_v_us as number } : {}),
          toleranciaPct: (prueba.tolerancia_pct as number | undefined) ?? 20,
        },
        medido,
        'V/µs',
      );
    });
  },
};

/**
 * Producto ganancia-ancho de banda: seguidor con un escalón pequeño (5 mV, para
 * no entrar en slew). Con un solo polo en GBW, el tiempo de subida del 10 % al
 * 90 % es tr = ln(9)/(2π·GBW) ≈ 0.35/GBW, así que GBW ≈ 0.35/tr.
 */
const anchoDeBanda: DefinicionPrueba = {
  descripcion: 'Producto ganancia-ancho de banda (tiempo de subida del seguidor)',
  campos: {
    ...camposAlimentacion,
    gbw_hz: { descripcion: 'GBW del datasheet', unidad: 'Hz', obligatorio: true, campo: { tipo: 'numeroOExpresion' } },
    tolerancia_pct: { descripcion: 'Tolerancia', unidad: '%', campo: { tipo: 'numero', minimo: 0, maximo: 100 } },
  },
  revisar: revisarAlimentacion,
  ejecutar(c, prueba) {
    const { vcc, vee, fijos } = alimentacion(prueba);
    const esperado = valorDe(prueba.gbw_hz as number | string);
    const tr = Math.log(9) / (2 * Math.PI * esperado);
    const medio = (vcc + vee) / 2;
    const salto = 5e-3;
    return porUnidad(c, prueba, 'Producto ganancia-ancho de banda', (pines, descripcion) => {
      const r = simularTransitorio(
        c,
        conectar(pines, vee, 'in', 'out', 'out'),
        [
          ...fijos,
          {
            tipo: 'fuenteVoltaje',
            nombre: 'VIN',
            positivo: 'in',
            negativo: '0',
            voltaje_v: medio,
            forma: { tipo: 'pulso', inicial: medio, pulsado: medio + salto, retardo_s: tr, subida_s: tr / 1000, bajada_s: tr / 1000, ancho_s: 100 * tr, periodo_s: 200 * tr },
          },
        ],
        { tiempoFinal_s: 10 * tr, pasoMaximo_s: tr / 50 },
      );
      const salida = r.voltajes.get('out')!;
      // El nivel de partida es la salida real antes del escalón (puede diferir de "medio" en microvoltios).
      const inicio = salida[0]!;
      const t10 = cruce(r.tiempos, salida, inicio + 0.1 * salto, tr);
      const t90 = cruce(r.tiempos, salida, inicio + 0.9 * salto, tr);
      if (t10 === null || t90 === null) throw new Error('La salida no siguió el escalón pequeño.');
      const medido = Math.log(9) / (2 * Math.PI * (t90 - t10));
      return compararPorcentaje(prueba, descripcion, esperado, medido, (prueba.tolerancia_pct as number | undefined) ?? 25, 'Hz');
    });
  },
};

export const categoriaOpamp: DefinicionCategoria = {
  categoria: 'amplificador_operacional',
  nombre: 'amplificador operacional',
  plantillas: {
    opamp_basico: {
      descripcion: 'Op-amp de un polo con slew rate y salida que satura según la alimentación',
      terminales: TERMINALES,
      parametros: {
        ganancia: { unidad: 'V/V', descripcion: 'Ganancia en lazo abierto (AVD)', minimo: 100, maximo: 1e8 },
        gbw_hz: { unidad: 'Hz', descripcion: 'Producto ganancia-ancho de banda', minimo: 1e3, maximo: 1e10 },
        slew_v_us: { unidad: 'V/µs', descripcion: 'Slew rate', minimo: 1e-3, maximo: 1e4 },
        margen_salida_alto_v: { unidad: 'V', descripcion: 'Cuánto por debajo de V+ satura la salida', defecto: 0, minimo: 0, maximo: 10 },
        margen_salida_bajo_v: { unidad: 'V', descripcion: 'Cuánto por encima de V− satura la salida', defecto: 0, minimo: 0, maximo: 10 },
        resistencia_entrada_ohm: { unidad: 'Ω', descripcion: 'Resistencia entre entradas', defecto: 1e12, minimo: 1e3, maximo: 1e15 },
        resistencia_salida_ohm: { unidad: 'Ω', descripcion: 'Resistencia de salida', defecto: 1, minimo: 1e-3, maximo: 1e4 },
        alimentacion_maxima_v: { unidad: 'V', descripcion: 'Alimentación total máxima (V+ − V−)', minimo: 1, maximo: 50, opcional: true },
      },
      construir(p, [inp, inn, out, vp, vn], v) {
        const a0 = v.ganancia!;
        const gbw = v.gbw_hz!;
        const sr = v.slew_v_us! * 1e6;
        const gm = a0 / R1_OHM;
        const c1 = a0 / (2 * Math.PI * gbw * R1_OHM);
        const vs = sr / (2 * Math.PI * gbw);
        return [
          { tipo: 'resistencia', nombre: `${p}RIN`, a: inp!, b: inn!, resistencia_ohm: v.resistencia_entrada_ohm! },
          { tipo: 'limitador', nombre: `${p}ASR`, positivo: `${p}s`, negativo: '0', controlPositivo: inp!, controlNegativo: inn!, ganancia: 1, minimo_v: -vs, maximo_v: vs, suavidad_v: vs / 20 },
          { tipo: 'vccs', nombre: `${p}GM`, desde: '0', hacia: `${p}x`, controlPositivo: `${p}s`, controlNegativo: '0', transconductancia_s: gm },
          { tipo: 'resistencia', nombre: `${p}R1`, a: `${p}x`, b: '0', resistencia_ohm: R1_OHM },
          { tipo: 'condensador', nombre: `${p}C1`, a: `${p}x`, b: '0', capacitancia_f: c1 },
          { tipo: 'vcvs', nombre: `${p}ECH`, positivo: `${p}ch`, negativo: '0', controlPositivo: vp!, controlNegativo: '0', ganancia: 1 },
          { tipo: 'diodo', nombre: `${p}DCH`, anodo: `${p}x`, catodo: `${p}ch` },
          { tipo: 'vcvs', nombre: `${p}ECL`, positivo: `${p}cl`, negativo: '0', controlPositivo: vn!, controlNegativo: '0', ganancia: 1 },
          { tipo: 'diodo', nombre: `${p}DCL`, anodo: `${p}cl`, catodo: `${p}x` },
          {
            tipo: 'limitador',
            nombre: `${p}AOUT`,
            positivo: `${p}o`,
            negativo: '0',
            controlPositivo: `${p}x`,
            controlNegativo: '0',
            ganancia: 1,
            minimo_v: v.margen_salida_bajo_v!,
            maximo_v: -v.margen_salida_alto_v!,
            referenciaMaxima: vp!,
            referenciaMinima: vn!,
            suavidad_v: 0.01,
          },
          { tipo: 'resistencia', nombre: `${p}ROUT`, a: `${p}o`, b: out!, resistencia_ohm: v.resistencia_salida_ohm! },
        ];
      },
    },
  },
  pruebas: {
    seguidor_de_voltaje: seguidor,
    saturacion_salida: saturacion,
    slew_rate: slewRate,
    ancho_de_banda: anchoDeBanda,
  },
  reglas(c: Componente, errores: ErrorValidacion[]) {
    if (c.pines.length < 5) {
      errores.push({ ruta: 'pines', mensaje: `Un amplificador operacional necesita al menos 5 pines (IN+, IN−, OUT, V+, V−); este tiene ${c.pines.length}.` });
    }
    if (c.modelo.tipo === 'subcircuito') {
      c.modelo.bloques?.forEach((b, k) => {
        if (b.usa !== 'opamp_basico') return;
        const repetidos = b.pines.filter((pin, i) => b.pines.indexOf(pin) !== i);
        if (repetidos.length > 0) {
          errores.push({ ruta: `modelo.bloques[${k}].pines`, mensaje: `El pin ${repetidos[0]} aparece dos veces; cada terminal (IN+, IN−, OUT, V+, V−) va a un pin distinto.` });
        }
      });
    }
  },
  resumen(c) {
    const n = c.modelo.tipo === 'subcircuito' ? (c.modelo.bloques ?? []).filter((b) => b.usa === 'opamp_basico').length : 0;
    return `${n > 0 ? `${n} ${n === 1 ? 'unidad' : 'unidades'}, ` : ''}${c.encapsulado}`;
  },
};
