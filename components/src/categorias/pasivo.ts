/**
 * Categoría "pasivo": resistencia, potenciómetro, condensador, bobina e interruptor.
 */

import type { Elemento } from '../../../engine/src';
import { corriente, cruce, simularDC, simularTransitorio } from '../banco';
import { compararPorcentaje, fallaPrueba } from './comun';
import type { ErrorValidacion } from '../esquema';
import { valorDe } from '../expresiones';
import type { Componente } from '../formato';
import { formatear, type DefinicionCategoria, type DefinicionPrueba } from './tipos';

/** Resistencia mínima de cada tramo del potenciómetro, para no tener 0 Ω exactos en los extremos. */
const R_MINIMA_TRAMO_OHM = 1e-3;

const campoPines = { descripcion: 'Los dos pines entre los que se mide', obligatorio: true, campo: { tipo: 'pines', cantidad: 2 } } as const;
const campoTolerancia = { descripcion: 'Tolerancia', unidad: '%', campo: { tipo: 'numero', minimo: 0, maximo: 100 } } as const;

/**
 * Resistencia entre dos pines: se aplica 1 V y se mide la corriente.
 * R = V / I = 1 V / I.
 */
const resistenciaEntrePines: DefinicionPrueba = {
  descripcion: 'Resistencia entre dos pines (se aplica 1 V y se mide la corriente)',
  campos: {
    pines: campoPines,
    esperado_ohm: { descripcion: 'Resistencia esperada', unidad: 'Ω', obligatorio: true, campo: { tipo: 'numeroOExpresion' } },
    tolerancia_pct: campoTolerancia,
  },
  ejecutar(c, prueba) {
    const [a, b] = prueba.pines as string[];
    const descripcion = `Resistencia entre ${a} y ${b}`;
    try {
      const esperado = valorDe(prueba.esperado_ohm as number | string);
      const fijos: Elemento[] = [{ tipo: 'fuenteVoltaje', nombre: 'VPRUEBA', positivo: 'p', negativo: '0', voltaje_v: 1 }];
      const r = simularDC(c, { [a!]: 'p', [b!]: '0' }, fijos);
      // La corriente de la fuente es negativa cuando entrega: R = 1 V / (−I).
      const medido = 1 / -corriente(r, 'VPRUEBA');
      return [compararPorcentaje(prueba, descripcion, esperado, medido, (prueba.tolerancia_pct as number | undefined) ?? 1, 'Ω')];
    } catch (error) {
      return [fallaPrueba(prueba, descripcion, error)];
    }
  },
};

/**
 * Capacitancia entre dos pines: se carga a través de 1 kΩ desde 1 V, partiendo
 * descargado. Al pasar una constante de tiempo τ = R·C el voltaje llega a
 * 1 − e^−1 = 63.2 %, así que C = t(63.2 %) / 1 kΩ.
 */
const capacitanciaEntrePines: DefinicionPrueba = {
  descripcion: 'Capacitancia entre dos pines (carga RC con 1 kΩ, tiempo hasta 63.2 %)',
  campos: {
    pines: campoPines,
    esperado_f: { descripcion: 'Capacitancia esperada', unidad: 'F', obligatorio: true, campo: { tipo: 'numeroOExpresion' } },
    tolerancia_pct: campoTolerancia,
  },
  ejecutar(c, prueba) {
    const [a, b] = prueba.pines as string[];
    const descripcion = `Capacitancia entre ${a} y ${b}`;
    try {
      const esperado = valorDe(prueba.esperado_f as number | string);
      const tau = 1e3 * esperado;
      const fijos: Elemento[] = [
        { tipo: 'fuenteVoltaje', nombre: 'VPRUEBA', positivo: 'p', negativo: '0', voltaje_v: 1 },
        { tipo: 'resistencia', nombre: 'RPRUEBA', a: 'p', b: 'x', resistencia_ohm: 1e3 },
      ];
      const r = simularTransitorio(c, { [a!]: 'x', [b!]: '0' }, fijos, {
        tiempoFinal_s: 4 * tau,
        pasoMaximo_s: tau / 100,
        usarCondicionesIniciales: true,
      });
      const t = cruce(r.tiempos, r.voltajes.get('x')!, 1 - Math.exp(-1));
      if (t === null) throw new Error(`El voltaje no llegó al 63.2 % en ${formatear(4 * tau, 's')}.`);
      return [compararPorcentaje(prueba, descripcion, esperado, t / 1e3, (prueba.tolerancia_pct as number | undefined) ?? 2, 'F')];
    } catch (error) {
      return [fallaPrueba(prueba, descripcion, error)];
    }
  },
};

/**
 * Inductancia entre dos pines: con 1 V y 1 kΩ en serie, la corriente sube
 * hacia 1 mA con τ = L/R; en t = τ vale 63.2 %, así que L = t(63.2 %) · 1 kΩ.
 */
const inductanciaEntrePines: DefinicionPrueba = {
  descripcion: 'Inductancia entre dos pines (circuito RL con 1 kΩ, tiempo hasta 63.2 %)',
  campos: {
    pines: campoPines,
    esperado_h: { descripcion: 'Inductancia esperada', unidad: 'H', obligatorio: true, campo: { tipo: 'numeroOExpresion' } },
    tolerancia_pct: campoTolerancia,
  },
  ejecutar(c, prueba) {
    const [a, b] = prueba.pines as string[];
    const descripcion = `Inductancia entre ${a} y ${b}`;
    try {
      const esperado = valorDe(prueba.esperado_h as number | string);
      const tau = esperado / 1e3;
      const fijos: Elemento[] = [
        { tipo: 'fuenteVoltaje', nombre: 'VPRUEBA', positivo: 'p', negativo: '0', voltaje_v: 1 },
        { tipo: 'resistencia', nombre: 'RPRUEBA', a: 'p', b: 'x', resistencia_ohm: 1e3 },
      ];
      const r = simularTransitorio(c, { [a!]: 'x', [b!]: '0' }, fijos, {
        tiempoFinal_s: 4 * tau,
        pasoMaximo_s: tau / 100,
        usarCondicionesIniciales: true,
      });
      const t = cruce(r.tiempos, r.elementos.get('RPRUEBA')!.corriente_a, 1e-3 * (1 - Math.exp(-1)));
      if (t === null) throw new Error(`La corriente no llegó al 63.2 % en ${formatear(4 * tau, 's')}.`);
      return [compararPorcentaje(prueba, descripcion, esperado, t * 1e3, (prueba.tolerancia_pct as number | undefined) ?? 2, 'H')];
    } catch (error) {
      return [fallaPrueba(prueba, descripcion, error)];
    }
  },
};

export const categoriaPasivo: DefinicionCategoria = {
  categoria: 'pasivo',
  nombre: 'pasivo',
  plantillas: {
    resistencia: {
      descripcion: 'Resistencia entre A y B',
      terminales: ['A', 'B'],
      parametros: {
        resistencia_ohm: { unidad: 'Ω', descripcion: 'Resistencia', minimo: 1e-3, maximo: 1e12 },
        potencia_w: { unidad: 'W', descripcion: 'Potencia máxima (para avisos)', defecto: 0.25, minimo: 1e-3, maximo: 1000 },
      },
      construir: (p, [a, b], v) => [{ tipo: 'resistencia', nombre: `${p}R`, a: a!, b: b!, resistencia_ohm: v.resistencia_ohm! }],
    },
    condensador: {
      descripcion: 'Condensador entre A y B',
      terminales: ['A', 'B'],
      parametros: {
        capacitancia_f: { unidad: 'F', descripcion: 'Capacitancia', minimo: 1e-15, maximo: 10 },
        voltaje_maximo_v: { unidad: 'V', descripcion: 'Voltaje máximo (para avisos)', defecto: 50, minimo: 1, maximo: 10000 },
      },
      construir: (p, [a, b], v) => [{ tipo: 'condensador', nombre: `${p}C`, a: a!, b: b!, capacitancia_f: v.capacitancia_f! }],
    },
    bobina: {
      descripcion: 'Bobina entre A y B',
      terminales: ['A', 'B'],
      parametros: {
        inductancia_h: { unidad: 'H', descripcion: 'Inductancia', minimo: 1e-12, maximo: 100 },
        corriente_maxima_a: { unidad: 'A', descripcion: 'Corriente máxima (para avisos)', defecto: 1, minimo: 1e-6, maximo: 1000 },
      },
      construir: (p, [a, b], v) => [{ tipo: 'bobina', nombre: `${p}L`, a: a!, b: b!, inductancia_h: v.inductancia_h! }],
    },
    potenciometro: {
      descripcion: 'Potenciómetro: resistencia total entre A y B, cursor W',
      terminales: ['A', 'W', 'B'],
      parametros: {
        resistencia_ohm: { unidad: 'Ω', descripcion: 'Resistencia total', minimo: 1, maximo: 1e9 },
        posicion: { unidad: '', descripcion: 'Posición del cursor: 0 = en A, 1 = en B', defecto: 0.5, minimo: 0, maximo: 1 },
        potencia_w: { unidad: 'W', descripcion: 'Potencia máxima (para avisos)', defecto: 0.25, minimo: 1e-3, maximo: 100 },
      },
      construir: (p, [a, w, b], v) => {
        const total = v.resistencia_ohm!;
        const posicion = v.posicion!;
        return [
          { tipo: 'resistencia', nombre: `${p}RAW`, a: a!, b: w!, resistencia_ohm: Math.max(total * posicion, R_MINIMA_TRAMO_OHM) },
          { tipo: 'resistencia', nombre: `${p}RWB`, a: w!, b: b!, resistencia_ohm: Math.max(total * (1 - posicion), R_MINIMA_TRAMO_OHM) },
        ];
      },
    },
    interruptor: {
      descripcion: 'Interruptor entre A y B (cerrado = 1, abierto = 0)',
      terminales: ['A', 'B'],
      parametros: {
        cerrado: { unidad: '', descripcion: '1 si está cerrado, 0 si está abierto', defecto: 0, minimo: 0, maximo: 1 },
        resistencia_cerrado_ohm: { unidad: 'Ω', descripcion: 'Resistencia de contacto', defecto: 0.05, minimo: 1e-6, maximo: 100 },
        resistencia_abierto_ohm: { unidad: 'Ω', descripcion: 'Resistencia abierto', defecto: 1e9, minimo: 1e6, maximo: 1e15 },
      },
      construir: (p, [a, b], v) => [
        {
          tipo: 'resistencia',
          nombre: `${p}S`,
          a: a!,
          b: b!,
          resistencia_ohm: v.cerrado! >= 0.5 ? v.resistencia_cerrado_ohm! : v.resistencia_abierto_ohm!,
        },
      ],
    },
  },
  pruebas: {
    resistencia_entre_pines: resistenciaEntrePines,
    capacitancia_entre_pines: capacitanciaEntrePines,
    inductancia_entre_pines: inductanciaEntrePines,
  },
  reglas(c: Componente, errores: ErrorValidacion[]) {
    if (c.pines.length < 2 || c.pines.length > 3) {
      errores.push({ ruta: 'pines', mensaje: `Un pasivo tiene 2 pines (3 un potenciómetro); este tiene ${c.pines.length}.` });
    }
  },
  resumen: (c) => `${c.pines.length} pines, ${c.encapsulado}`,
};

