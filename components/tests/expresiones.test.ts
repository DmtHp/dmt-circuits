import { describe, expect, it } from 'vitest';
import { ErrorExpresion, evaluarExpresion, valorDe } from '../src/expresiones';

describe('analizador de expresiones', () => {
  it.each([
    ['1.5', 1.5],
    ['4.7k', 4700],
    ['2 + 3 * 4', 14], // primero la multiplicación: 2 + 12
    ['(2 + 3) * 4', 20],
    ['10 / 4', 2.5],
    ['-3 + 5', 2],
    ['--2', 2],
    ['1meg * 1k', 1e9],
    ['100n', 100e-9],
  ])('"%s" = %d', (texto, esperado) => {
    expect(evaluarExpresion(texto)).toBeCloseTo(esperado, 12);
  });

  it('usa variables y acepta una unidad después de un número', () => {
    // El ejemplo del documento del proyecto: con VCC = 5 V, "VCC - 1.5 V" = 3.5 V
    expect(evaluarExpresion('VCC - 1.5 V', { VCC: 5 })).toBeCloseTo(3.5, 12);
    expect(evaluarExpresion('(VCC + VEE) / 2', { VCC: 15, VEE: -15 })).toBe(0);
  });

  it.each([
    ['', 'vacía'],
    ['2 +', 'termina'],
    ['(2 + 3', 'paréntesis'],
    ['2 3', 'Sobra'],
    ['1 / 0', 'cero'],
    ['VDD - 1', 'No conozco "VDD"'],
    ['alert(1)', 'No conozco'],
    ['2 ** 3', 'Sobra'],
    ['process.exit()', 'no es un número válido'],
    ['2; 3', 'carácter'],
  ])('rechaza "%s" con un mensaje claro', (texto, fragmento) => {
    expect(() => evaluarExpresion(texto, { VCC: 5 })).toThrow(ErrorExpresion);
    expect(() => evaluarExpresion(texto, { VCC: 5 })).toThrow(fragmento);
  });

  it('valorDe acepta números o textos', () => {
    expect(valorDe(3)).toBe(3);
    expect(valorDe('2.2k')).toBeCloseTo(2200, 9);
    expect(() => valorDe(Number.NaN)).toThrow(ErrorExpresion);
  });
});
