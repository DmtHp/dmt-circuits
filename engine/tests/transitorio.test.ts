import { describe, expect, it } from 'vitest';
import { analizarDC } from '../src/dc';
import { ErrorCircuito } from '../src/errores';
import { evaluarForma, siguienteQuiebre } from '../src/formasDeOnda';
import { leerNetlist } from '../src/netlist';
import { analizarTransitorio, type OpcionesTransitorio, type ResultadoTransitorio } from '../src/transitorio';

function simular(netlist: string, opciones: OpcionesTransitorio): ResultadoTransitorio {
  return analizarTransitorio(leerNetlist(netlist), opciones);
}

function serieV(r: ResultadoTransitorio, nodo: string): number[] {
  const serie = r.voltajes.get(nodo);
  if (!serie) throw new Error(`No hay serie para el nodo ${nodo}.`);
  return serie;
}

function serieI(r: ResultadoTransitorio, nombre: string): number[] {
  const serie = r.elementos.get(nombre);
  if (!serie) throw new Error(`No hay serie para ${nombre}.`);
  return serie.corriente_a;
}

/** Mayor diferencia entre la simulación y la fórmula exacta, en todos los instantes calculados. */
function errorMaximo(tiempos: number[], serie: number[], exacta: (t: number) => number): number {
  let peor = 0;
  tiempos.forEach((t, k) => {
    peor = Math.max(peor, Math.abs(serie[k]! - exacta(t)));
  });
  return peor;
}

/** Valores de la serie dentro de [desde, hasta]. */
function tramo(r: ResultadoTransitorio, serie: number[], desde: number, hasta: number): number[] {
  return serie.filter((_, k) => r.tiempos[k]! >= desde && r.tiempos[k]! <= hasta);
}

describe('formas de onda', () => {
  it('seno: 5 V de amplitud a 1 kHz', () => {
    const seno = { tipo: 'seno' as const, desplazamiento: 1, amplitud: 5, frecuencia_hz: 1000 };
    // A un cuarto de período (0.25 ms) el seno vale su máximo: 1 + 5 = 6 V
    expect(evaluarForma(seno, 0.25e-3)).toBeCloseTo(6, 12);
    expect(evaluarForma(seno, 0.5e-3)).toBeCloseTo(1, 9);
  });

  const pulso = {
    tipo: 'pulso' as const,
    inicial: 0,
    pulsado: 5,
    retardo_s: 1e-3,
    subida_s: 1e-6,
    bajada_s: 1e-6,
    ancho_s: 2e-3,
    periodo_s: 5e-3,
  };

  it('pulso: valores en cada tramo', () => {
    expect(evaluarForma(pulso, 0.5e-3)).toBe(0); // antes del retardo
    expect(evaluarForma(pulso, 1e-3 + 0.5e-6)).toBeCloseTo(2.5, 9); // mitad de la subida
    expect(evaluarForma(pulso, 2e-3)).toBe(5); // arriba
    expect(evaluarForma(pulso, 4e-3)).toBe(0); // abajo
    expect(evaluarForma(pulso, 7e-3)).toBe(5); // segundo ciclo (1 + 5 + 1 ms)
  });

  it('pulso: quiebres en cada esquina', () => {
    expect(siguienteQuiebre(pulso, 0)).toBe(1e-3);
    expect(siguienteQuiebre(pulso, 1e-3)).toBeCloseTo(1e-3 + 1e-6, 15);
    expect(siguienteQuiebre(pulso, 2e-3)).toBeCloseTo(1e-3 + 1e-6 + 2e-3, 15);
    expect(siguienteQuiebre(pulso, 4e-3)).toBeCloseTo(6e-3, 15); // inicio del segundo ciclo
  });
});

describe('transitorio: circuitos RC, RL y LC', () => {
  it('carga de un condensador (RC, τ = 1 ms)', () => {
    const r = simular(
      `
      V1 1 0 5
      R1 1 2 1k
      C1 2 0 1u IC=0
    `,
      { tiempoFinal_s: 5e-3, usarCondicionesIniciales: true },
    );
    // A mano: v(t) = 5 · (1 − e^(−t/τ)), τ = R·C = 1k · 1u = 1 ms. En t = τ: 5 · 0.632 = 3.16 V
    const exacta = (t: number) => 5 * (1 - Math.exp(-t / 1e-3));
    expect(errorMaximo(r.tiempos, serieV(r, '2'), exacta)).toBeLessThan(5e-3);
    expect(r.tiempos.at(-1)).toBeCloseTo(5e-3, 12);
    // Al final (5τ) queda a menos de 1 % de 5 V: 5 · e^−5 = 0.034 V
    expect(serieV(r, '2').at(-1)).toBeCloseTo(5 * (1 - Math.exp(-5)), 2);
  });

  it('descarga desde un voltaje inicial', () => {
    const r = simular(
      `
      C1 1 0 1u IC=5
      R1 1 0 1k
    `,
      { tiempoFinal_s: 5e-3, usarCondicionesIniciales: true },
    );
    // A mano: v(t) = 5 · e^(−t/τ), τ = 1 ms. La corriente del condensador sale por arriba: i = −v/R.
    const exacta = (t: number) => 5 * Math.exp(-t / 1e-3);
    expect(errorMaximo(r.tiempos, serieV(r, '1'), exacta)).toBeLessThan(5e-3);
    expect(errorMaximo(r.tiempos, serieI(r, 'C1'), (t) => -exacta(t) / 1e3)).toBeLessThan(5e-6);
  });

  it('pulso que carga un RC partiendo del punto de operación', () => {
    const r = simular(
      `
      V1 1 0 PULSE(0 5 1m 1u 1u 10m 20m)
      R1 1 2 1k
      C1 2 0 1u
    `,
      { tiempoFinal_s: 6e-3 },
    );
    // Hasta 1 ms la fuente vale 0 y el condensador está descargado (punto DC = 0 V).
    // Desde que termina la subida (1.001 ms): v(t) ≈ 5 · (1 − e^(−(t − 1 ms)/τ)).
    expect(r.estadisticas.puntoInicial).toBe('directo');
    expect(r.tiempos).toContain(1e-3); // el paso cae justo en el borde
    const exacta = (t: number) => (t < 1e-3 ? 0 : 5 * (1 - Math.exp(-(t - 1e-3) / 1e-3)));
    // Margen extra por la subida de 1 µs, que el cálculo a mano trata como instantánea (≈ 5 V · 1 µs/2/τ = 2.5 mV).
    expect(errorMaximo(r.tiempos, serieV(r, '2'), exacta)).toBeLessThan(1e-2);
  });

  it('corriente en una bobina (RL, τ = L/R = 0.1 ms)', () => {
    const r = simular(
      `
      V1 1 0 10
      R1 1 2 100
      L1 2 0 10m IC=0
    `,
      { tiempoFinal_s: 0.5e-3, usarCondicionesIniciales: true },
    );
    // A mano: i(t) = (V/R) · (1 − e^(−t/τ)) = 0.1 A · (1 − e^(−t/0.1 ms))
    const exacta = (t: number) => 0.1 * (1 - Math.exp(-t / 1e-4));
    expect(errorMaximo(r.tiempos, serieI(r, 'L1'), exacta)).toBeLessThan(1e-4);
  });

  it('circuito LC: oscila con período 2π√(LC) y conserva la energía', () => {
    const L = 1e-3;
    const C = 1e-6;
    const periodo = 2 * Math.PI * Math.sqrt(L * C); // = 2π · 31.62 µs = 198.7 µs
    const r = simular(
      `
      C1 1 0 1u IC=1
      L1 1 0 1m
    `,
      { tiempoFinal_s: 10 * periodo, usarCondicionesIniciales: true },
    );
    const v = serieV(r, '1');
    const i = serieI(r, 'L1');

    // Período: tiempo entre cruces por cero de bajada, interpolando entre puntos.
    const cruces: number[] = [];
    for (let k = 1; k < v.length; k++) {
      if (v[k - 1]! > 0 && v[k]! <= 0) {
        const t0 = r.tiempos[k - 1]!;
        const t1 = r.tiempos[k]!;
        cruces.push(t0 + ((t1 - t0) * v[k - 1]!) / (v[k - 1]! - v[k]!));
      }
    }
    expect(cruces.length).toBeGreaterThanOrEqual(9);
    const periodoMedido = (cruces.at(-1)! - cruces[0]!) / (cruces.length - 1);
    expect(Math.abs(periodoMedido / periodo - 1)).toBeLessThan(0.01);

    // Energía: ½·C·v² + ½·L·i² = ½ · 1u · 1² = 0.5 µJ al empezar, y no debe perderse.
    // (La trapezoidal no agrega ni quita energía en un LC: por eso se elige.)
    const energiaInicial = 0.5 * C * 1;
    v.forEach((vk, k) => {
      const energia = 0.5 * C * vk * vk + 0.5 * L * i[k]! ** 2;
      expect(Math.abs(energia / energiaInicial - 1)).toBeLessThan(0.02);
    });
  });
});

describe('transitorio: fuentes de señal y elementos no lineales', () => {
  it('seno en un divisor resistivo: la salida es la mitad en cada instante', () => {
    const r = simular(
      `
      V1 1 0 SIN(0 10 1k)
      R1 1 2 1k
      R2 2 0 1k
    `,
      { tiempoFinal_s: 2e-3 },
    );
    const exacta = (t: number) => 5 * Math.sin(2 * Math.PI * 1000 * t);
    expect(errorMaximo(r.tiempos, serieV(r, '2'), exacta)).toBeLessThan(1e-9);
    // Al menos 20 puntos por ciclo.
    expect(r.tiempos.length).toBeGreaterThanOrEqual(40);
  });

  it('rectificador de media onda con filtro', () => {
    const r = simular(
      `
      V1 1 0 SIN(0 10 60)
      D1 1 2
      C1 2 0 100u
      R1 2 0 1k
    `,
      { tiempoFinal_s: 5 / 60 },
    );
    // Último ciclo (de 4/60 s a 5/60 s):
    // - Pico ≈ Vp − Vd. En el pico la corriente del diodo ≈ la de R1 (≈ 9.3 mA),
    //   y Vd = Vt·ln(9.3 mA / 1e-14 A) ≈ 0.71 V  →  pico ≈ 10 − 0.71 = 9.29 V
    // - Rizado ≈ Vpico / (R·f·C) = 9.29 / (1k · 60 · 100u) ≈ 1.55 V. Es una cota superior: supone
    //   que el condensador se descarga el ciclo completo, pero el diodo vuelve a conducir antes
    //   (cuando la entrada sube y alcanza al condensador), así que el rizado real es menor (≈ 1.25 V).
    //   Con descarga exponencial durante ~0.8 de ciclo: 9.29 · (1 − e^(−0.8/(60 · 0.1))) = 1.16 V.
    const ultimo = tramo(r, serieV(r, '2'), 4 / 60, 5 / 60);
    const pico = Math.max(...ultimo);
    const rizado = pico - Math.min(...ultimo);
    expect(pico).toBeGreaterThan(9.1);
    expect(pico).toBeLessThan(9.45);
    expect(rizado).toBeGreaterThan(1.2);
    expect(rizado).toBeLessThan(1.7);
  });

  it('op-amp saturado siguiendo un seno', () => {
    const r = simular(
      `
      VIN entrada 0 SIN(0 2 1k)
      R1  entrada menos 1k
      R2  menos salida 10k
      A1  salida 0 0 menos GANANCIA=100k MIN=-12 MAX=12
    `,
      { tiempoFinal_s: 1e-3 },
    );
    // Ganancia −10: el pico ideal sería ∓20 V, pero se recorta en ±12 V.
    const salida = serieV(r, 'salida');
    expect(Math.min(...salida)).toBeCloseTo(-12, 3);
    expect(Math.max(...salida)).toBeCloseTo(12, 3);
  });

  it('el análisis DC usa el valor DC y el transitorio usa la forma', () => {
    const texto = `
      V1 1 0 DC 2 SIN(0 5 1k)
      R1 1 0 1k
    `;
    expect(analizarDC(leerNetlist(texto)).voltajes.get('1')).toBeCloseTo(2, 12);
    const r = simular(texto, { tiempoFinal_s: 1e-3 });
    expect(serieV(r, '1')[0]).toBeCloseTo(0, 12); // SIN en t = 0 vale 0
  });
});

describe('transitorio: rendimiento y errores', () => {
  it('reutiliza la factorización en un circuito lineal', () => {
    const r = simular(
      `
      V1 1 0 5
      R1 1 2 1k
      C1 2 0 1u
    `,
      { tiempoFinal_s: 20e-3, pasoMaximo_s: 0.1e-3 },
    );
    // Con el paso estable, muchos pasos comparten la misma matriz.
    expect(r.estadisticas.factorizaciones).toBeLessThan(r.estadisticas.pasosAceptados / 4);
  });

  it('escalera RC de 100 etapas: miles de pasos en poco tiempo', () => {
    const lineas = ['V1 n0 0 PULSE(0 5 0 1u 1u 5m 10m)'];
    for (let k = 1; k <= 100; k++) {
      lineas.push(`R${k} n${k - 1} n${k} 100`, `C${k} n${k} 0 100n`);
    }
    const circuito = leerNetlist(lineas.join('\n'));
    const inicio = performance.now();
    const r = analizarTransitorio(circuito, { tiempoFinal_s: 20e-3 });
    const duracion_ms = performance.now() - inicio;
    // 100 nodos y 101 incógnitas. Margen amplio para computadores modestos.
    expect(r.estadisticas.pasosAceptados).toBeGreaterThan(100);
    expect(duracion_ms).toBeLessThan(2000);
  });

  it('rechaza un tiempo final inválido', () => {
    expect(() => simular('V1 1 0 5\nR1 1 0 1k', { tiempoFinal_s: 0 })).toThrow(ErrorCircuito);
  });

  it('rechaza un pulso sin tiempo de subida', () => {
    let error: unknown;
    try {
      simular('V1 1 0 PULSE(0 5 0 0 1u 1m 2m)\nR1 1 0 1k', { tiempoFinal_s: 1e-3 });
    } catch (e) {
      error = e;
    }
    expect((error as ErrorCircuito).codigo).toBe('valor_invalido');
    expect((error as ErrorCircuito).message).toContain('subida');
  });

  it('sin condiciones iniciales, una bobina en paralelo con una fuente es un error en DC', () => {
    expect(() => simular('V1 1 0 5\nL1 1 0 1m', { tiempoFinal_s: 1e-3 })).toThrow(ErrorCircuito);
  });
});
