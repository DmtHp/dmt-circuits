import { describe, expect, it } from 'vitest';
import { corrienteOhm } from '../src/ohm';

describe('corrienteOhm (ley de Ohm)', () => {
  it('5 V sobre 1 kΩ da 5 mA', () => {
    // A mano: I = 5 V / 1000 Ω = 0.005 A = 5 mA
    expect(corrienteOhm(5, 1000)).toBeCloseTo(0.005, 12);
  });

  it('12 V sobre 330 Ω da unos 36.36 mA', () => {
    // A mano: I = 12 / 330 = 0.036363... A
    expect(corrienteOhm(12, 330)).toBeCloseTo(0.0363636, 6);
  });

  it('rechaza una resistencia de 0 Ω (sería un cortocircuito)', () => {
    expect(() => corrienteOhm(5, 0)).toThrow(RangeError);
  });
});
