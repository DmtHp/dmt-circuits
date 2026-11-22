/**
 * Analizador de expresiones matemáticas propio (sin eval ni new Function).
 *
 * Sirve para valores como "VCC - 1.5 V" o "2 * 4.7k" dentro de los archivos
 * de componentes. Solo entiende:
 *   - números, con sufijo SPICE opcional (4.7k, 100n, 2meg) y una unidad
 *     opcional después (V, A, Ω, ohm, F, H, Hz, s, W), que se ignora;
 *   - nombres de variables (VCC, VEE, GND…) que da quien evalúa;
 *   - + − × ÷ (escritos + - * /), signo negativo y paréntesis.
 * Cualquier otra cosa es un error con un mensaje claro. Así un archivo de
 * componente nunca puede ejecutar código.
 *
 * Cómo funciona: primero se corta el texto en "fichas" (números, nombres,
 * símbolos) y después se lee con una gramática por niveles (descenso recursivo):
 *   expresión = término { (+|−) término }
 *   término   = factor { (*|/) factor }
 *   factor    = (+|−) factor | número [unidad] | nombre | ( expresión )
 * El nivel más bajo se resuelve primero, por eso * y / van antes que + y −.
 */

import { leerValor } from '../../engine/src';

export class ErrorExpresion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorExpresion';
  }
}

type Ficha =
  | { tipo: 'numero'; valor: number; texto: string }
  | { tipo: 'nombre'; texto: string }
  | { tipo: 'simbolo'; texto: '+' | '-' | '*' | '/' | '(' | ')' };

const UNIDADES = new Set(['v', 'a', 'ω', 'ohm', 'ohms', 'f', 'h', 'hz', 's', 'w']);
const LARGO_MAXIMO = 200;

function cortar(texto: string): Ficha[] {
  if (texto.length > LARGO_MAXIMO) throw new ErrorExpresion(`La expresión es demasiado larga (máximo ${LARGO_MAXIMO} caracteres).`);
  const fichas: Ficha[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if ('+-*/()'.includes(c)) {
      fichas.push({ tipo: 'simbolo', texto: c as '+' | '-' | '*' | '/' | '(' | ')' });
      i++;
    } else if (/[0-9.]/.test(c)) {
      // Número: dígitos, punto, exponente (e±n) y sufijo pegado (k, meg, u…).
      const m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:meg|[fpnuµmkgt])?/i.exec(texto.slice(i));
      const crudo = m?.[0] ?? c;
      const valor = leerValor(crudo);
      if (valor === null) throw new ErrorExpresion(`"${crudo}" no es un número válido.`);
      fichas.push({ tipo: 'numero', valor, texto: crudo });
      i += crudo.length;
    } else if (/[A-Za-zΩµ_]/.test(c)) {
      const m = /^[A-Za-zΩµ_][A-Za-z0-9Ωµ_]*/.exec(texto.slice(i))!;
      fichas.push({ tipo: 'nombre', texto: m[0] });
      i += m[0].length;
    } else {
      throw new ErrorExpresion(`No entiendo el carácter "${c}". Solo se permiten números, nombres, + - * / y paréntesis.`);
    }
  }
  return fichas;
}

/** Evalúa la expresión con las variables dadas. Lanza ErrorExpresion si algo no es válido. */
export function evaluarExpresion(texto: string, variables: Readonly<Record<string, number>> = {}): number {
  const fichas = cortar(texto);
  let pos = 0;
  const ver = (): Ficha | undefined => fichas[pos];
  const esSimbolo = (f: Ficha | undefined, s: string): boolean => f?.tipo === 'simbolo' && f.texto === s;

  const expresion = (): number => {
    let valor = termino();
    while (esSimbolo(ver(), '+') || esSimbolo(ver(), '-')) {
      const op = (fichas[pos++] as { texto: string }).texto;
      const derecha = termino();
      valor = op === '+' ? valor + derecha : valor - derecha;
    }
    return valor;
  };
  const termino = (): number => {
    let valor = factor();
    while (esSimbolo(ver(), '*') || esSimbolo(ver(), '/')) {
      const op = (fichas[pos++] as { texto: string }).texto;
      const derecha = factor();
      if (op === '/' && derecha === 0) throw new ErrorExpresion('División por cero.');
      valor = op === '*' ? valor * derecha : valor / derecha;
    }
    return valor;
  };
  const factor = (): number => {
    const f = ver();
    if (!f) throw new ErrorExpresion('La expresión termina antes de tiempo.');
    pos++;
    if (f.tipo === 'simbolo') {
      if (f.texto === '-') return -factor();
      if (f.texto === '+') return factor();
      if (f.texto === '(') {
        const valor = expresion();
        if (!esSimbolo(ver(), ')')) throw new ErrorExpresion('Falta cerrar un paréntesis.');
        pos++;
        return valor;
      }
      throw new ErrorExpresion(`Sobra "${f.texto}".`);
    }
    if (f.tipo === 'numero') {
      const siguiente = ver();
      if (siguiente?.tipo === 'nombre' && UNIDADES.has(siguiente.texto.toLowerCase())) pos++;
      return f.valor;
    }
    const valor = Object.prototype.hasOwnProperty.call(variables, f.texto) ? variables[f.texto] : undefined;
    if (valor === undefined) {
      const disponibles = Object.keys(variables);
      throw new ErrorExpresion(
        `No conozco "${f.texto}".` + (disponibles.length > 0 ? ` Se puede usar: ${disponibles.join(', ')}.` : ' Aquí no se permiten nombres, solo números.'),
      );
    }
    return valor;
  };

  if (fichas.length === 0) throw new ErrorExpresion('La expresión está vacía.');
  const valor = expresion();
  if (pos < fichas.length) {
    const sobra = fichas[pos]!;
    throw new ErrorExpresion(`Sobra "${'texto' in sobra ? sobra.texto : ''}" al final de la expresión.`);
  }
  if (!Number.isFinite(valor)) throw new ErrorExpresion('El resultado no es un número finito.');
  return valor;
}

/** Un número o una expresión de texto. */
export type NumeroOExpresion = number | string;

/** Devuelve el valor numérico de un campo que puede ser número o expresión. */
export function valorDe(campo: NumeroOExpresion, variables: Readonly<Record<string, number>> = {}): number {
  if (typeof campo === 'number') {
    if (!Number.isFinite(campo)) throw new ErrorExpresion('El número no es finito.');
    return campo;
  }
  return evaluarExpresion(campo, variables);
}
