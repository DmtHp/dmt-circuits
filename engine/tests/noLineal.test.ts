import { describe, expect, it } from 'vitest';
import { analizarDC, type ResultadoDC } from '../src/dc';
import { ErrorCircuito } from '../src/errores';
import { leerNetlist } from '../src/netlist';
import { curvaLimitador } from '../src/primitivas/limitador';
import { evaluarDiodo, limitarUnion, VOLTAJE_TERMICO_V } from '../src/primitivas/diodo';

const VT = VOLTAJE_TERMICO_V; // k·T/q a 27 °C ≈ 25.865 mV

function resolver(netlist: string): ResultadoDC {
  return analizarDC(leerNetlist(netlist));
}

function v(r: ResultadoDC, nodo: string): number {
  const valor = r.voltajes.get(nodo);
  if (valor === undefined) throw new Error(`No hay voltaje para el nodo ${nodo}.`);
  return valor;
}

function i(r: ResultadoDC, nombre: string): number {
  const m = r.elementos.get(nombre);
  if (!m) throw new Error(`No hay medidas para ${nombre}.`);
  return m.corriente_a;
}

describe('voltaje térmico', () => {
  it('Vt = k·T/q a 300.15 K', () => {
    // 1.380649e-23 J/K · 300.15 K / 1.602176634e-19 C = 0.0258649 V
    expect(VT).toBeCloseTo(0.0258649, 7);
  });
});

describe('modelo del diodo', () => {
  it('la corriente sigue la ecuación de Shockley y vale 0 en 0 V', () => {
    const d = { tipo: 'diodo' as const, nombre: 'D1', anodo: '1', catodo: '0' };
    expect(evaluarDiodo(d, 0, 0).corriente_a).toBe(0);
    // A 0.6 V: Is·(e^(0.6/Vt) − 1) con Is = 1e-14 A
    expect(evaluarDiodo(d, 0.6, 0).corriente_a).toBeCloseTo(1e-14 * (Math.exp(0.6 / VT) - 1), 18);
    // La conductancia es la derivada: Is/Vt · e^(V/Vt)
    expect(evaluarDiodo(d, 0.6, 0).conductancia_s).toBeCloseTo((1e-14 / VT) * Math.exp(0.6 / VT), 15);
  });

  it('el limitador de unión frena saltos grandes por encima del voltaje crítico', () => {
    const vCritico = VT * Math.log(VT / (Math.SQRT2 * 1e-14)); // ≈ 0.81 V
    // Saltos pequeños o por debajo del crítico no se tocan.
    expect(limitarUnion(0.5, 0, VT, vCritico)).toBe(0.5);
    expect(limitarUnion(0.70, 0.69, VT, vCritico)).toBe(0.70);
    // De 0.7 V a 5 V: avanza vAnterior + Vt·ln(1 + Δv/Vt) = 0.7 + Vt·ln(1 + 4.3/Vt) ≈ 0.832 V
    expect(limitarUnion(5, 0.7, VT, vCritico)).toBeCloseTo(0.7 + VT * Math.log(1 + 4.3 / VT), 12);
  });
});

describe('DC no lineal: diodos', () => {
  it('1 mA en un diodo: fórmula cerrada', () => {
    const r = resolver(`
      I1 0 1 1m
      D1 1 0
    `);
    // Despejando Shockley: V = Vt · ln(I/Is + 1) = 0.0258649 · ln(1e11 + 1) = 0.65512 V
    expect(v(r, '1')).toBeCloseTo(VT * Math.log(1e-3 / 1e-14 + 1), 8);
    expect(v(r, '1')).toBeCloseTo(0.65512, 4);
    expect(r.estrategia).toBe('directo');
  });

  it('coeficiente de emisión e Is distintos', () => {
    const r = resolver(`
      I1 0 1 1m
      D1 1 0 IS=1n N=2
    `);
    // V = n·Vt · ln(I/Is + 1) = 2 · 0.0258649 · ln(1e6 + 1) = 0.71467 V
    expect(v(r, '1')).toBeCloseTo(2 * VT * Math.log(1e-3 / 1e-9 + 1), 8);
  });

  it('diodo con resistencia: cumple Kirchhoff y Shockley a la vez', () => {
    const r = resolver(`
      V1 1 0 5
      R1 1 2 1k
      D1 2 0
    `);
    // A mano, por sustitución sucesiva:
    //   Vd = 0.7 V      → I = (5 − 0.7)/1k = 4.3 mA     → Vd = Vt·ln(4.3e-3/1e-14) = 0.69284 V
    //   Vd = 0.69284 V  → I = 4.30716 mA                → Vd = 0.69289 V  (ya no cambia)
    const vd = v(r, '2');
    expect(vd).toBeCloseTo(0.69289, 4);
    const iResistencia = (5 - vd) / 1000;
    const iShockley = 1e-14 * (Math.exp(vd / VT) - 1);
    expect(iShockley / iResistencia).toBeCloseTo(1, 6);
    expect(i(r, 'D1')).toBeCloseTo(iResistencia, 9);
    // Newton-Raphson converge en pocas iteraciones.
    expect(r.iteraciones).toBeLessThan(20);
  });

  it('diodo en inversa: casi no conduce', () => {
    const r = resolver(`
      V1 1 0 -5
      R1 1 2 1k
      D1 2 0
    `);
    // En inversa I ≈ −Is − gmin·5 V ≈ −5e-12 A, así que R1 casi no tiene caída: V2 ≈ −5 V.
    expect(v(r, '2')).toBeCloseTo(-5, 6);
    expect(Math.abs(i(r, 'D1'))).toBeLessThan(1e-10);
  });

  it('corriente muy grande (resistencia de 1 Ω) también converge', () => {
    const r = resolver(`
      V1 1 0 10
      R1 1 2 1
      D1 2 0
    `);
    // I ≈ (10 − 0.89)/1 ≈ 9.1 A y Vd = Vt·ln(9.1/1e-14) ≈ 0.890 V
    const vd = v(r, '2');
    expect(vd).toBeCloseTo(VT * Math.log((10 - vd) / 1e-14 + 1), 8);
    expect(vd).toBeCloseTo(0.890, 2);
  });

  it('regulador zener de 5.1 V', () => {
    const r = resolver(`
      V1 1 0 12
      R1 1 2 1k
      DZ 0 2 BV=5.1 IBV=1m
    `);
    // En ruptura, I = Ibv · e^((Vz − BV)/Vt), así que Vz = BV + Vt·ln(I/Ibv), con I = (12 − Vz)/1k.
    //   Vz = 5.15 V    → I = 6.85 mA     → Vz = 5.1 + 0.0258649·ln(6.85) = 5.14977 V
    //   Vz = 5.14977 V → I = 6.85023 mA  → Vz = 5.14977 V (ya no cambia)
    const vz = v(r, '2');
    expect(vz).toBeCloseTo(5.14977, 4);
    expect(vz).toBeCloseTo(5.1 + VT * Math.log((12 - vz) / 1000 / 1e-3), 8);
    // La corriente del diodo va de ánodo (0) a cátodo (2): en ruptura es negativa.
    expect(i(r, 'DZ')).toBeCloseTo(-(12 - vz) / 1000, 9);
  });

  it('el zener regula: de 12 V a 15 V de entrada, la salida cambia menos de 10 mV', () => {
    const salida = (entrada: number) =>
      v(resolver(`V1 1 0 ${entrada}\nR1 1 2 1k\nDZ 0 2 BV=5.1`), '2');
    // A mano: ΔVz = Vt·ln(I15/I12) = 0.0258649·ln(9.85/6.85) = 9.4 mV
    const cambio = salida(15) - salida(12);
    expect(cambio).toBeCloseTo(VT * Math.log(9.84063 / 6.85023), 4);
    expect(cambio).toBeLessThan(0.01);
  });

  it('dos diodos en serie: cada uno toma la mitad', () => {
    const r = resolver(`
      I1 0 1 1m
      D1 1 2
      D2 2 0
    `);
    // Con la misma corriente, los dos diodos iguales tienen el mismo voltaje.
    const uno = VT * Math.log(1e-3 / 1e-14 + 1);
    expect(v(r, '1')).toBeCloseTo(2 * uno, 8);
    expect(v(r, '2')).toBeCloseTo(uno, 8);
  });
});

describe('limitador suave', () => {
  const lim = {
    tipo: 'limitador' as const,
    nombre: 'A1',
    positivo: '2',
    negativo: '0',
    controlPositivo: '1',
    controlNegativo: '0',
    ganancia: 1,
    minimo_v: -5,
    maximo_v: 5,
    suavidad_v: 0.01,
  };

  it('copia la entrada lejos de los topes y se queda en el tope más allá', () => {
    expect(curvaLimitador(lim, 2).salida_v).toBeCloseTo(2, 12);
    expect(curvaLimitador(lim, 2).pendiente).toBeCloseTo(1, 12);
    expect(curvaLimitador(lim, 10).salida_v).toBeCloseTo(5, 12);
    expect(curvaLimitador(lim, -10).salida_v).toBeCloseTo(-5, 12);
    expect(curvaLimitador(lim, 10).pendiente).toBeCloseTo(0, 12);
    // Justo en el tope, la esquina redondeada queda s·ln 2 por debajo: 5 − 0.01·0.6931 = 4.99307 V
    expect(curvaLimitador(lim, 5).salida_v).toBeCloseTo(5 - 0.01 * Math.LN2, 12);
  });

  it.each([
    [2, 2],
    [10, 5],
    [-7, -5],
  ])('en un circuito: entrada %d V → salida %d V', (entrada, salida) => {
    const r = resolver(`
      V1 1 0 ${entrada}
      A1 2 0 1 0 MIN=-5 MAX=5 SUAVIDAD=0.01
      RL 2 0 1k
    `);
    expect(v(r, '2')).toBeCloseTo(salida, 9);
  });

  const inversor = (entrada: number) =>
    resolver(`
      VIN entrada 0 ${entrada}
      R1  entrada menos 1k
      R2  menos salida 10k
      A1  salida 0 0 menos GANANCIA=100k MIN=-13.5 MAX=13.5
    `);

  it('op-amp inversor de ganancia −10 en zona lineal', () => {
    const r = inversor(0.5);
    // Ganancia ideal −R2/R1 = −10. Con ganancia finita A = 1e5:
    //   Vsal = −10 · 0.5 / (1 + (1 + R2/R1)/A) = −5 / (1 + 11e-5) = −4.99945 V
    expect(v(r, 'salida')).toBeCloseTo(-5 / (1 + 11e-5), 6);
  });

  it('op-amp inversor que satura en −13.5 V', () => {
    const r = inversor(2);
    // Ideal: −10 · 2 = −20 V, pero la salida no puede bajar de −13.5 V.
    expect(v(r, 'salida')).toBeCloseTo(-13.5, 6);
    // Saturado, ya no hay cortocircuito virtual: V− = (2·10k + (−13.5)·1k)/11k = 0.5909 V
    expect(v(r, 'menos')).toBeCloseTo((2 * 10e3 - 13.5 * 1e3) / 11e3, 6);
  });
});

describe('convergencia', () => {
  it('si no logra converger, lo dice y nombra el diodo', () => {
    const circuito = leerNetlist(`
      V1 1 0 5
      R1 1 2 1k
      D1 2 0
    `);
    let error: unknown;
    try {
      analizarDC(circuito, { maxIteraciones: 1 });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorCircuito);
    expect((error as ErrorCircuito).codigo).toBe('no_converge');
    expect((error as ErrorCircuito).elementos).toContain('D1');
  });

  it('un circuito lineal se resuelve en una sola vuelta', () => {
    const r = resolver('V1 1 0 5\nR1 1 0 1k');
    expect(r.iteraciones).toBe(1);
  });
});
