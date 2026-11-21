import { describe, expect, it } from 'vitest';
import { ErrorMatrizSingular, MatrizDensa } from '../src/matriz';

function matrizDesde(filas: number[][]): MatrizDensa {
  const m = new MatrizDensa(filas.length);
  filas.forEach((fila, f) => fila.forEach((valor, c) => m.sumar(f, c, valor)));
  return m;
}

describe('MatrizDensa y factorización LU', () => {
  // Sistema elegido para que la solución sea x = [1, 2, 3]:
  //   0·1 + 2·2 + 1·3 = 7
  //   1·1 + 1·2 + 1·3 = 6
  //   2·1 + 1·2 + 0·3 = 4
  // La casilla (0,0) es 0: sin pivoteo, la eliminación dividiría por cero.
  const A = [
    [0, 2, 1],
    [1, 1, 1],
    [2, 1, 0],
  ];

  it('resuelve un sistema 3×3 que necesita intercambiar filas', () => {
    const x = matrizDesde(A).factorizar().resolver([7, 6, 4]);
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(2, 12);
    expect(x[2]).toBeCloseTo(3, 12);
  });

  it('reutiliza la factorización con otro lado derecho', () => {
    const lu = matrizDesde(A).factorizar();
    lu.resolver([7, 6, 4]);
    // Si x = [1, 0, 0], entonces b es la primera columna de A: [0, 1, 2].
    const x = lu.resolver([0, 1, 2]);
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(0, 12);
    expect(x[2]).toBeCloseTo(0, 12);
  });

  it('no modifica la matriz original al factorizar', () => {
    const m = matrizDesde(A);
    m.factorizar();
    expect(m.obtener(0, 0)).toBe(0);
    expect(m.obtener(2, 0)).toBe(2);
  });

  it('suma en la misma casilla (así estampan varios componentes)', () => {
    const m = new MatrizDensa(1);
    m.sumar(0, 0, 0.001); // 1/1 kΩ
    m.sumar(0, 0, 0.0005); // 1/2 kΩ
    expect(m.obtener(0, 0)).toBeCloseTo(0.0015, 15);
    m.limpiar();
    expect(m.obtener(0, 0)).toBe(0);
  });

  it('detecta una matriz singular', () => {
    // La fila 2 es el doble de la fila 1: no hay solución única.
    const m = matrizDesde([
      [1, 2],
      [2, 4],
    ]);
    expect(() => m.factorizar()).toThrow(ErrorMatrizSingular);
  });

  it('rechaza un lado derecho de tamaño equivocado', () => {
    expect(() => matrizDesde(A).factorizar().resolver([1, 2])).toThrow(RangeError);
  });
});
