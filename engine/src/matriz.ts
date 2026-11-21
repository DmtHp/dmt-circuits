/**
 * Matrices y resolución de sistemas lineales A · x = b.
 *
 * El motor solo usa la interfaz `Matriz`. Hoy la implementación es densa
 * (guarda todos los valores, incluso los ceros). Si con circuitos grandes hace
 * falta, se agrega una matriz dispersa que cumpla la misma interfaz y el resto
 * del motor no cambia.
 */

/** Una factorización ya hecha. Se puede usar muchas veces con distintos lados derechos. */
export interface Factorizacion {
  readonly n: number;
  /** Resuelve A · x = b y devuelve x. No modifica b. */
  resolver(b: ArrayLike<number>): Float64Array;
}

export interface Matriz {
  readonly n: number;
  /** Suma `valor` a la casilla (fila, columna). Así "estampan" los componentes. */
  sumar(fila: number, columna: number, valor: number): void;
  obtener(fila: number, columna: number): number;
  /** Pone todas las casillas en cero. */
  limpiar(): void;
  /** Factoriza una copia de la matriz (la original no cambia). */
  factorizar(): Factorizacion;
}

/** La matriz no tiene inversa: el sistema no tiene una solución única. */
export class ErrorMatrizSingular extends Error {
  /** Columna (incógnita) donde no se encontró un pivote útil. */
  readonly columna: number;

  constructor(columna: number) {
    super(`La matriz es singular: no hay pivote útil en la columna ${columna}.`);
    this.name = 'ErrorMatrizSingular';
    this.columna = columna;
  }
}

/**
 * Un pivote se considera cero si es menor que TOLERANCIA_RELATIVA por el valor
 * más grande de la matriz. Un double tiene unas 16 cifras significativas, así
 * que algo 10^13 veces más chico que el resto es, en la práctica, ruido de redondeo.
 */
const TOLERANCIA_RELATIVA = 1e-13;

export class MatrizDensa implements Matriz {
  readonly n: number;
  /** Valores guardados fila por fila: la casilla (f, c) está en f * n + c. */
  private readonly datos: Float64Array;

  constructor(n: number) {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError(`El tamaño de la matriz debe ser un entero ≥ 0 (recibí ${n}).`);
    }
    this.n = n;
    this.datos = new Float64Array(n * n);
  }

  sumar(fila: number, columna: number, valor: number): void {
    this.datos[fila * this.n + columna]! += valor;
  }

  obtener(fila: number, columna: number): number {
    return this.datos[fila * this.n + columna]!;
  }

  limpiar(): void {
    this.datos.fill(0);
  }

  factorizar(): Factorizacion {
    return FactorizacionLUDensa.desde(this.n, this.datos);
  }
}

/**
 * Factorización LU con pivoteo parcial: P · A = L · U.
 *
 * - L es triangular inferior con unos en la diagonal.
 * - U es triangular superior.
 * - P es el orden en que quedaron las filas tras los intercambios.
 *
 * Es la misma eliminación gaussiana que se hace a mano, pero se guardan los
 * multiplicadores (L) para poder resolver otro lado derecho sin repetir el trabajo.
 *
 * Pivoteo parcial: en cada columna se elige como pivote la fila con el valor
 * absoluto más grande. Así nunca se divide por un número casi cero, que
 * amplificaría los errores de redondeo.
 */
class FactorizacionLUDensa implements Factorizacion {
  private constructor(
    readonly n: number,
    /** L (debajo de la diagonal) y U (diagonal y arriba) en una sola matriz. */
    private readonly lu: Float64Array,
    /** permutacion[i] = fila original que terminó en la posición i. */
    private readonly permutacion: Int32Array,
  ) {}

  static desde(n: number, datos: Float64Array): FactorizacionLUDensa {
    const a = Float64Array.from(datos);
    const permutacion = new Int32Array(n);
    for (let i = 0; i < n; i++) permutacion[i] = i;

    let escala = 0;
    for (let i = 0; i < a.length; i++) escala = Math.max(escala, Math.abs(a[i]!));
    const tolerancia = escala * TOLERANCIA_RELATIVA;

    for (let k = 0; k < n; k++) {
      // 1. Buscar el pivote: el valor más grande (en valor absoluto) de la columna k.
      let filaPivote = k;
      let maximo = Math.abs(a[k * n + k]!);
      for (let i = k + 1; i < n; i++) {
        const valor = Math.abs(a[i * n + k]!);
        if (valor > maximo) {
          maximo = valor;
          filaPivote = i;
        }
      }
      if (!(maximo > tolerancia)) throw new ErrorMatrizSingular(k);

      // 2. Intercambiar filas si hace falta.
      if (filaPivote !== k) {
        for (let j = 0; j < n; j++) {
          const t = a[k * n + j]!;
          a[k * n + j] = a[filaPivote * n + j]!;
          a[filaPivote * n + j] = t;
        }
        const t = permutacion[k]!;
        permutacion[k] = permutacion[filaPivote]!;
        permutacion[filaPivote] = t;
      }

      // 3. Eliminar debajo del pivote y guardar el multiplicador en L.
      const pivote = a[k * n + k]!;
      for (let i = k + 1; i < n; i++) {
        const multiplicador = a[i * n + k]! / pivote;
        a[i * n + k] = multiplicador;
        if (multiplicador === 0) continue;
        for (let j = k + 1; j < n; j++) {
          a[i * n + j]! -= multiplicador * a[k * n + j]!;
        }
      }
    }
    return new FactorizacionLUDensa(n, a, permutacion);
  }

  resolver(b: ArrayLike<number>): Float64Array {
    const { n, lu, permutacion } = this;
    if (b.length !== n) {
      throw new RangeError(`El lado derecho tiene ${b.length} valores y la matriz es de ${n}×${n}.`);
    }
    // Sustitución hacia adelante: L · y = P · b
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let suma = b[permutacion[i]!]!;
      for (let j = 0; j < i; j++) suma -= lu[i * n + j]! * x[j]!;
      x[i] = suma;
    }
    // Sustitución hacia atrás: U · x = y
    for (let i = n - 1; i >= 0; i--) {
      let suma = x[i]!;
      for (let j = i + 1; j < n; j++) suma -= lu[i * n + j]! * x[j]!;
      x[i] = suma / lu[i * n + i]!;
    }
    return x;
  }
}
