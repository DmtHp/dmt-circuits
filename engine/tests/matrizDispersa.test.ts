import { describe, expect, it } from 'vitest';
import { ErrorMatrizSingular, MatrizDensa } from '../src/matriz';
import { MatrizDispersa } from '../src/matrizDispersa';

/** Generador pseudoaleatorio con semilla fija, para que la prueba sea repetible. */
function aleatorio(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('MatrizDispersa', () => {
  it('resuelve el mismo sistema 3×3 que necesita pivoteo', () => {
    // Igual que en la densa: solución x = [1, 2, 3], con la casilla (0,0) en cero.
    const m = new MatrizDispersa(3);
    [
      [0, 2, 1],
      [1, 1, 1],
      [2, 1, 0],
    ].forEach((fila, f) => fila.forEach((v, c) => m.sumar(f, c, v)));
    const x = m.factorizar().resolver([7, 6, 4]);
    expect(Array.from(x).map((v) => Number(v.toFixed(12)))).toEqual([1, 2, 3]);
  });

  it('da el mismo resultado que la densa en 50 sistemas dispersos al azar', () => {
    const azar = aleatorio(12345);
    for (let caso = 0; caso < 50; caso++) {
      const n = 5 + Math.floor(azar() * 60);
      const densa = new MatrizDensa(n);
      const dispersa = new MatrizDispersa(n);
      // Diagonal dominante (como las conductancias de un circuito) más unos pocos valores sueltos.
      for (let i = 0; i < n; i++) {
        const valor = 5 + azar() * 10;
        densa.sumar(i, i, valor);
        dispersa.sumar(i, i, valor);
        for (let k = 0; k < 3; k++) {
          const j = Math.floor(azar() * n);
          const v = azar() * 2 - 1;
          densa.sumar(i, j, v);
          dispersa.sumar(i, j, v);
        }
      }
      const b = Array.from({ length: n }, () => azar() * 10 - 5);
      const xd = densa.factorizar().resolver(b);
      const xs = dispersa.factorizar().resolver(b);
      for (let i = 0; i < n; i++) expect(xs[i]).toBeCloseTo(xd[i]!, 9);
    }
  });

  it('funciona con ceros en la diagonal, como las filas de las fuentes de voltaje', () => {
    // Divisor del plan de la Etapa 1: incógnitas V1, V2, I. A mano: V1 = 10, V2 = 6.6667, I = −3.3333 mA.
    const g1 = 1 / 1000;
    const g2 = 1 / 2000;
    const m = new MatrizDispersa(3);
    m.sumar(0, 0, g1);
    m.sumar(0, 1, -g1);
    m.sumar(1, 0, -g1);
    m.sumar(1, 1, g1 + g2);
    m.sumar(0, 2, 1);
    m.sumar(2, 0, 1);
    const x = m.factorizar().resolver([0, 0, 10]);
    expect(x[0]).toBeCloseTo(10, 12);
    expect(x[1]).toBeCloseTo(20 / 3, 12);
    expect(x[2]).toBeCloseTo(-10 / 3000, 15);
  });

  it('guarda solo los valores distintos de cero', () => {
    // Escalera tridiagonal de 100: 100 + 2·99 = 298 valores de 10 000 casillas.
    const m = new MatrizDispersa(100);
    for (let i = 0; i < 100; i++) {
      m.sumar(i, i, 2);
      if (i > 0) m.sumar(i, i - 1, -1);
      if (i < 99) m.sumar(i, i + 1, -1);
    }
    expect(m.noCeros()).toBe(298);
  });

  it('detecta una matriz singular', () => {
    const m = new MatrizDispersa(2);
    m.sumar(0, 0, 1);
    m.sumar(0, 1, 2);
    m.sumar(1, 0, 2);
    m.sumar(1, 1, 4);
    expect(() => m.factorizar()).toThrow(ErrorMatrizSingular);
  });

  it('reutiliza la factorización', () => {
    const m = new MatrizDispersa(2);
    m.sumar(0, 0, 2);
    m.sumar(1, 1, 4);
    const lu = m.factorizar();
    expect(Array.from(lu.resolver([2, 4]))).toEqual([1, 1]);
    expect(Array.from(lu.resolver([4, 8]))).toEqual([2, 2]);
  });
});
