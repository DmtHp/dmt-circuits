import { describe, expect, it } from 'vitest';
import type { Circuito } from '../src/circuito';
import { leerNetlist } from '../src/netlist';
import { analizarTransitorio, SesionTransitorio } from '../src/transitorio';

const rc = (r: string): Circuito =>
  leerNetlist(`
    V1 1 0 5
    R1 1 2 ${r}
    C1 2 0 1u
  `);

describe('sesión de transitorio por partes', () => {
  it('avanzar en pedazos da lo mismo que de una vez', () => {
    const completo = analizarTransitorio(rc('1k'), { tiempoFinal_s: 5e-3, pasoMaximo_s: 0.1e-3 });
    const sesion = new SesionTransitorio(rc('1k'), { pasoMaximo_s: 0.1e-3, tiempoFinal_s: 5e-3 });
    const tiempos: number[] = [];
    const v2: number[] = [];
    for (let k = 1; k <= 10; k++) {
      const parte = sesion.avanzar(k * 0.5e-3);
      tiempos.push(...parte.tiempos);
      v2.push(...parte.voltajes.get('2')!);
    }
    expect(sesion.tiempo_s).toBeCloseTo(5e-3, 12);
    // Mismo valor final (los pasos pueden caer en instantes distintos por los cortes, pero la curva es la misma).
    // A mano: el punto DC inicial es 5 V (condensador ya cargado), así que se queda en 5 V.
    expect(v2.at(-1)).toBeCloseTo(completo.voltajes.get('2')!.at(-1)!, 6);
    expect(tiempos[0]).toBe(0);
  });

  it('respeta el presupuesto de tiempo de cómputo', () => {
    const sesion = new SesionTransitorio(rc('1k'), { pasoMaximo_s: 1e-9, usarCondicionesIniciales: true });
    // Con pasos de 1 ns, llegar a 1 s llevaría mil millones de pasos: el presupuesto lo corta.
    const inicio = performance.now();
    sesion.avanzar(1, 20);
    expect(performance.now() - inicio).toBeLessThan(500);
    expect(sesion.tiempo_s).toBeGreaterThan(0);
    expect(sesion.tiempo_s).toBeLessThan(1);
  });

  it('cambiar una resistencia a mitad de camino conserva la carga del condensador', () => {
    // Carga con R = 1 kΩ (τ = 1 ms) durante 1 ms: v = 5·(1 − e^−1) = 3.161 V.
    const sesion = new SesionTransitorio(
      leerNetlist(`
        V1 1 0 5
        R1 1 2 1k
        C1 2 0 1u IC=0
      `),
      { pasoMaximo_s: 10e-6, usarCondicionesIniciales: true },
    );
    const primera = sesion.avanzar(1e-3);
    const v1ms = primera.voltajes.get('2')!.at(-1)!;
    expect(v1ms).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);

    // Ahora R = 10 kΩ (τ = 10 ms). Desde 3.161 V, durante 1 ms más:
    //   v = 5 − (5 − 3.161)·e^(−1/10) = 5 − 1.839·0.9048 = 3.336 V
    sesion.actualizarValores(
      leerNetlist(`
        V1 1 0 5
        R1 1 2 10k
        C1 2 0 1u IC=0
      `),
    );
    const segunda = sesion.avanzar(2e-3);
    const esperado = 5 - (5 - v1ms) * Math.exp(-0.1);
    expect(segunda.voltajes.get('2')!.at(-1)).toBeCloseTo(esperado, 2);
  });

  it('no acepta un circuito con otra forma', () => {
    const sesion = new SesionTransitorio(rc('1k'), { pasoMaximo_s: 1e-4 });
    expect(() => sesion.actualizarValores(leerNetlist('V1 1 0 5\nR1 1 3 1k\nC1 3 0 1u'))).toThrow('cambió de forma');
  });
});
