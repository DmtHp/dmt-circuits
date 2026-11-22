/**
 * Matriz dispersa: solo guarda las casillas distintas de cero.
 *
 * En un circuito, cada nodo se conecta con pocos otros, así que la matriz
 * del MNA es casi toda ceros (en una escalera de 100 nodos, ~3 valores útiles
 * por fila de 101). Guardar y recorrer solo lo útil ahorra mucho trabajo.
 *
 * La factorización LU se hace en dos partes, como en los simuladores tipo SPICE:
 *
 * 1. Plan (simbólico, caro, se hace pocas veces): se elige el orden de los
 *    pivotes con el criterio de Markowitz y se anota qué casillas se van a
 *    usar, incluidas las que se llenan al eliminar ("relleno").
 *      costo de un pivote en (fila r, columna c) = (valores en la fila r − 1) · (valores en la columna c − 1)
 *    que es la cantidad máxima de casillas que puede llenar. Se elige el de
 *    menor costo, pero solo entre los que no son demasiado chicos frente al
 *    mayor de su columna (umbral), para no perder precisión.
 *
 * 2. Números (barato, cada vez): con el plan ya hecho, la factorización es
 *    una lista fija de restas y multiplicaciones sobre un arreglo de valores.
 *
 * En Newton-Raphson y en el transitorio la matriz cambia de valores pero no de
 * forma, así que el plan se reutiliza. Si en algún paso un pivote del plan
 * quedó demasiado chico, o aparece una casilla nueva, se rehace el plan.
 */

import { ErrorMatrizSingular, type Factorizacion, type Matriz } from './matriz';

/** Un pivote es aceptable si |valor| ≥ UMBRAL_PIVOTE · (mayor |valor| de su columna). */
const UMBRAL_PIVOTE = 1e-3;
/** Igual que en la densa: algo 10^13 veces más chico que lo mayor de la matriz es ruido. */
const TOLERANCIA_RELATIVA = 1e-13;

/** El plan de una factorización: orden de pivotes y casillas, como arreglos planos. */
interface Plan {
  n: number;
  /** Casilla (f·n + c) → posición en el arreglo de valores. */
  posicion: Map<number, number>;
  casillas: number;
  /** Por paso k: fila, columna y posición del pivote. */
  filaPivote: Int32Array;
  columnaPivote: Int32Array;
  posPivote: Int32Array;
  /** Por paso k, las filas que se eliminan (L): de inicioL[k] a inicioL[k+1]. */
  inicioL: Int32Array;
  filasL: Int32Array;
  posL: Int32Array;
  /** Por paso k, el resto de la fila pivote (U): de inicioU[k] a inicioU[k+1]. */
  inicioU: Int32Array;
  columnasU: Int32Array;
  posU: Int32Array;
  /** Por cada entrada e de L, las restas valor[destino] −= m · valor[origen], de inicioResta[e] a inicioResta[e+1]. */
  inicioResta: Int32Array;
  destino: Int32Array;
  origen: Int32Array;
}

export class MatrizDispersa implements Matriz {
  readonly n: number;
  /** filas[f] = mapa columna → valor (solo casillas distintas de cero). */
  private readonly filas: Map<number, number>[];
  private plan: Plan | null = null;
  /** Cuántas veces hubo que hacer el plan completo (para medir). */
  planes = 0;

  constructor(n: number) {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError(`El tamaño de la matriz debe ser un entero ≥ 0 (recibí ${n}).`);
    }
    this.n = n;
    this.filas = Array.from({ length: n }, () => new Map<number, number>());
  }

  sumar(fila: number, columna: number, valor: number): void {
    if (valor === 0) return;
    const f = this.filas[fila]!;
    f.set(columna, (f.get(columna) ?? 0) + valor);
  }

  obtener(fila: number, columna: number): number {
    return this.filas[fila]!.get(columna) ?? 0;
  }

  limpiar(): void {
    for (const f of this.filas) f.clear();
  }

  /** Cantidad de casillas guardadas (para medir qué tan dispersa es). */
  noCeros(): number {
    let total = 0;
    for (const f of this.filas) total += f.size;
    return total;
  }

  factorizar(): Factorizacion {
    if (this.plan) {
      const rapida = factorizarConPlan(this.plan, this.filas);
      if (rapida) return rapida;
    }
    this.planes++;
    this.plan = planificar(this.n, this.filas);
    const conPlanNuevo = factorizarConPlan(this.plan, this.filas);
    if (!conPlanNuevo) throw new ErrorMatrizSingular(0);
    return conPlanNuevo;
  }
}

/**
 * Elige el orden de pivotes (Markowitz con umbral) haciendo la eliminación
 * con mapas, y anota cada operación para poder repetirla rápido.
 */
function planificar(n: number, original: Map<number, number>[]): Plan {
  const filas = original.map((f) => new Map(f));
  const columnas = Array.from({ length: n }, () => new Set<number>());
  let escala = 0;
  filas.forEach((f, r) => {
    for (const [c, v] of f) {
      columnas[c]!.add(r);
      escala = Math.max(escala, Math.abs(v));
    }
  });
  const tolerancia = escala * TOLERANCIA_RELATIVA;

  // Columnas todavía sin pivote, en una lista que se achica (se quita cambiando por la última).
  const activas = Array.from({ length: n }, (_, c) => c);
  const lugar = Int32Array.from(activas);
  const quitarColumna = (c: number): void => {
    const i = lugar[c]!;
    const ultima = activas.pop()!;
    if (ultima !== c) {
      activas[i] = ultima;
      lugar[ultima] = i;
    }
  };

  const posicion = new Map<number, number>();
  const pos = (f: number, c: number): number => {
    const clave = f * n + c;
    let p = posicion.get(clave);
    if (p === undefined) {
      p = posicion.size;
      posicion.set(clave, p);
    }
    return p;
  };

  const filaPivote = new Int32Array(n);
  const columnaPivote = new Int32Array(n);
  const posPivote = new Int32Array(n);
  const inicioL = [0];
  const filasL: number[] = [];
  const posL: number[] = [];
  const inicioU = [0];
  const columnasU: number[] = [];
  const posU: number[] = [];
  const inicioResta = [0];
  const destino: number[] = [];
  const origen: number[] = [];

  for (let k = 0; k < n; k++) {
    const [r, c] = buscarPivote(activas, filas, columnas, tolerancia);
    const filaP = filas[r]!;
    const pivote = filaP.get(c)!;
    filaPivote[k] = r;
    columnaPivote[k] = c;
    posPivote[k] = pos(r, c);

    const resto: number[] = [];
    for (const j of filaP.keys()) if (j !== c) resto.push(j);
    for (const j of resto) {
      columnasU.push(j);
      posU.push(pos(r, j));
    }
    inicioU.push(columnasU.length);

    for (const i of columnas[c]!) {
      if (i === r) continue;
      const fila = filas[i]!;
      const m = fila.get(c)! / pivote;
      fila.delete(c);
      filasL.push(i);
      posL.push(pos(i, c));
      for (const j of resto) {
        const anterior = fila.get(j);
        if (anterior === undefined) columnas[j]!.add(i);
        fila.set(j, (anterior ?? 0) - m * filaP.get(j)!);
        destino.push(pos(i, j));
        origen.push(pos(r, j));
      }
      inicioResta.push(destino.length);
    }
    inicioL.push(filasL.length);

    for (const j of resto) columnas[j]!.delete(r);
    columnas[c]!.clear();
    quitarColumna(c);
  }

  return {
    n,
    posicion,
    casillas: posicion.size,
    filaPivote,
    columnaPivote,
    posPivote,
    inicioL: Int32Array.from(inicioL),
    filasL: Int32Array.from(filasL),
    posL: Int32Array.from(posL),
    inicioU: Int32Array.from(inicioU),
    columnasU: Int32Array.from(columnasU),
    posU: Int32Array.from(posU),
    inicioResta: Int32Array.from(inicioResta),
    destino: Int32Array.from(destino),
    origen: Int32Array.from(origen),
  };
}

/**
 * Markowitz con umbral: entre los valores que no son demasiado chicos frente
 * al mayor de su columna, el de menor (valores en su fila − 1)·(valores en su columna − 1).
 */
function buscarPivote(activas: number[], filas: Map<number, number>[], columnas: Set<number>[], tolerancia: number): [number, number] {
  let mejorFila = -1;
  let mejorColumna = -1;
  let mejorCosto = Infinity;
  let mejorValor = 0;
  for (const c of activas) {
    const enColumna = columnas[c]!;
    let maximo = 0;
    for (const r of enColumna) maximo = Math.max(maximo, Math.abs(filas[r]!.get(c)!));
    // Una columna sin ningún valor útil: esa incógnita no queda determinada.
    if (!(maximo > tolerancia)) throw new ErrorMatrizSingular(c);
    const umbral = maximo * UMBRAL_PIVOTE;
    const cuentaColumna = enColumna.size - 1;
    for (const r of enColumna) {
      const valor = Math.abs(filas[r]!.get(c)!);
      if (valor < umbral) continue;
      const costo = (filas[r]!.size - 1) * cuentaColumna;
      if (costo < mejorCosto || (costo === mejorCosto && valor > mejorValor)) {
        mejorCosto = costo;
        mejorFila = r;
        mejorColumna = c;
        mejorValor = valor;
      }
    }
  }
  if (mejorFila < 0) throw new ErrorMatrizSingular(activas[0] ?? 0);
  return [mejorFila, mejorColumna];
}

/** Factorización numérica siguiendo el plan. Devuelve null si el plan no sirve para estos valores. */
function factorizarConPlan(plan: Plan, filas: Map<number, number>[]): FactorizacionLUDispersa | null {
  const { n, posicion } = plan;
  const valores = new Float64Array(plan.casillas);
  let escala = 0;
  for (let f = 0; f < n; f++) {
    for (const [c, v] of filas[f]!) {
      const p = posicion.get(f * n + c);
      if (p === undefined) return null; // casilla nueva: hay que rehacer el plan
      valores[p] = v;
      escala = Math.max(escala, Math.abs(v));
    }
  }
  const tolerancia = escala * TOLERANCIA_RELATIVA;

  const { posPivote, inicioL, posL, inicioResta, destino, origen } = plan;
  for (let k = 0; k < n; k++) {
    const pivote = valores[posPivote[k]!]!;
    const absPivote = Math.abs(pivote);
    if (!(absPivote > tolerancia)) return null;
    // Umbral: el pivote no puede ser mucho más chico que lo que elimina.
    for (let e = inicioL[k]!; e < inicioL[k + 1]!; e++) {
      if (absPivote < UMBRAL_PIVOTE * Math.abs(valores[posL[e]!]!)) return null;
    }
    for (let e = inicioL[k]!; e < inicioL[k + 1]!; e++) {
      const m = valores[posL[e]!]! / pivote;
      valores[posL[e]!] = m;
      if (m === 0) continue;
      for (let t = inicioResta[e]!; t < inicioResta[e + 1]!; t++) valores[destino[t]!]! -= m * valores[origen[t]!]!;
    }
  }
  return new FactorizacionLUDispersa(plan, valores);
}

class FactorizacionLUDispersa implements Factorizacion {
  readonly n: number;

  constructor(
    private readonly plan: Plan,
    private readonly valores: Float64Array,
  ) {
    this.n = plan.n;
  }

  resolver(b: ArrayLike<number>): Float64Array {
    const { n, plan, valores } = this;
    if (b.length !== n) {
      throw new RangeError(`El lado derecho tiene ${b.length} valores y la matriz es de ${n}×${n}.`);
    }
    const { filaPivote, columnaPivote, posPivote, inicioL, filasL, posL, inicioU, columnasU, posU } = plan;
    // Hacia adelante (L): cada paso resta su fila pivote de las filas que eliminó.
    const y = Float64Array.from(b as ArrayLike<number>);
    for (let k = 0; k < n; k++) {
      const yp = y[filaPivote[k]!]!;
      if (yp === 0) continue;
      for (let e = inicioL[k]!; e < inicioL[k + 1]!; e++) y[filasL[e]!]! -= valores[posL[e]!]! * yp;
    }
    // Hacia atrás (U): del último pivote al primero.
    const x = new Float64Array(n);
    for (let k = n - 1; k >= 0; k--) {
      let suma = y[filaPivote[k]!]!;
      for (let e = inicioU[k]!; e < inicioU[k + 1]!; e++) suma -= valores[posU[e]!]! * x[columnasU[e]!]!;
      x[columnaPivote[k]!] = suma / valores[posPivote[k]!]!;
    }
    return x;
  }
}
