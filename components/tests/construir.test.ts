import { describe, expect, it } from 'vitest';
import { analizarDC, analizarTransitorio, type Elemento } from '../../engine/src';
import { BIBLIOTECA } from '../src/biblioteca';
import { construir, RESISTENCIA_PIN_LIBRE_OHM } from '../src/construir';
import type { Componente } from '../src/formato';

function kit(id: string): Componente {
  const c = BIBLIOTECA.get(id);
  if (!c) throw new Error(`No está ${id} en la biblioteca.`);
  return c;
}

const fuente = (nombre: string, positivo: string, voltaje_v: number): Elemento => ({
  tipo: 'fuenteVoltaje',
  nombre,
  positivo,
  negativo: '0',
  voltaje_v,
});
const resistencia = (nombre: string, a: string, b: string, resistencia_ohm: number): Elemento => ({
  tipo: 'resistencia',
  nombre,
  a,
  b,
  resistencia_ohm,
});

describe('construir componentes en un circuito', () => {
  it('LM358 como amplificador no inversor de ganancia 2 con 5 V', () => {
    // Ganancia = 1 + Rf/Rg = 1 + 10k/10k = 2. Con 1 V de entrada, la salida es 2 V (lejos de VCC − 1.5 = 3.5 V).
    const u1 = construir(kit('lm358'), 'U1', { 'IN1+': 'in', 'IN1-': 'n', OUT1: 'out', VCC: 'vcc', GND: '0' });
    const r = analizarDC({
      elementos: [fuente('VCC', 'vcc', 5), fuente('VIN', 'in', 1), resistencia('RF', 'out', 'n', 10e3), resistencia('RG', 'n', '0', 10e3), ...u1.elementos],
    });
    // Con ganancia finita A = 1e5 y β = 1/2: Vsal = 2 / (1 + 2/A) = 1.99996 V
    expect(r.voltajes.get('out')).toBeCloseTo(2 / (1 + 2e-5), 4);
    // La segunda unidad no se usó: sus pines quedaron a tierra a través de 1 GΩ y se avisa.
    expect(u1.pinesSinConectar).toEqual(['IN2+', 'IN2-', 'OUT2']);
  });

  it('el mismo LM358 satura en VCC − 1.5 V cuando la ganancia lo pide', () => {
    // Ganancia 2 con 2.5 V de entrada pediría 5 V, pero el LM358 con 5 V llega hasta 3.5 V.
    const u1 = construir(kit('lm358'), 'U1', { 'IN1+': 'in', 'IN1-': 'n', OUT1: 'out', VCC: 'vcc', GND: '0' });
    const r = analizarDC({
      elementos: [fuente('VCC', 'vcc', 5), fuente('VIN', 'in', 2.5), resistencia('RF', 'out', 'n', 10e3), resistencia('RG', 'n', '0', 10e3), ...u1.elementos],
    });
    expect(r.voltajes.get('out')).toBeCloseTo(3.5, 2);
  });

  it('dos instancias del mismo componente no chocan', () => {
    // Dos LED rojos en paralelo, cada uno con su resistencia de 330 Ω, desde 5 V.
    const d1 = construir(kit('led_rojo_5mm'), 'D1', { A: 'a1', K: '0' });
    const d2 = construir(kit('led_rojo_5mm'), 'D2', { A: 'a2', K: '0' });
    const r = analizarDC({
      elementos: [fuente('V1', 'vcc', 5), resistencia('R1', 'vcc', 'a1', 330), resistencia('R2', 'vcc', 'a2', 330), ...d1.elementos, ...d2.elementos],
    });
    // A mano: I ≈ (5 − 2.0)/330 ≈ 9 mA por LED, y los dos iguales.
    const i1 = r.elementos.get('R1')!.corriente_a;
    expect(i1).toBeGreaterThan(8e-3);
    expect(i1).toBeLessThan(10e-3);
    expect(r.elementos.get('R2')!.corriente_a).toBeCloseTo(i1, 9);
  });

  it('los parámetros de la instancia reemplazan a los del archivo', () => {
    // La resistencia del kit vale 1 kΩ; esta instancia vale 4.7 kΩ. Divisor 4.7k / (4.7k + 4.7k) = 1/2.
    const r1 = construir(kit('resistencia'), 'R1', { A: 'vcc', B: 'mitad' }, { resistencia_ohm: 4.7e3 });
    const r2 = construir(kit('resistencia'), 'R2', { A: 'mitad', B: '0' }, { resistencia_ohm: 4.7e3 });
    const r = analizarDC({ elementos: [fuente('V1', 'vcc', 10), ...r1.elementos, ...r2.elementos] });
    expect(r.voltajes.get('mitad')).toBeCloseTo(5, 9);
    expect(r.elementos.get('V1')!.corriente_a).toBeCloseTo(-10 / 9.4e3, 12);
  });

  it('se puede conectar por número de pin', () => {
    // Pin 1 = A, pin 2 = K del 1N4148.
    const d = construir(kit('1n4148'), 'D1', { '1': 'a', '2': '0' });
    const r = analizarDC({ elementos: [{ tipo: 'fuenteCorriente', nombre: 'I1', desde: '0', hacia: 'a', corriente_a: 10e-3 }, ...d.elementos] });
    expect(r.voltajes.get('a')).toBeGreaterThan(0.6);
    expect(r.voltajes.get('a')).toBeLessThan(0.75);
  });

  it('un pin libre queda a tierra a través de 1 GΩ', () => {
    const d = construir(kit('1n4148'), 'D1', { A: 'a' });
    expect(d.pinesSinConectar).toEqual(['K']);
    expect(d.elementos).toContainEqual({ tipo: 'resistencia', nombre: 'D1.libre.K', a: 'D1.K', b: '0', resistencia_ohm: RESISTENCIA_PIN_LIBRE_OHM });
  });

  it('LM741 con ±15 V como inversor de ganancia −10 siguiendo un seno', () => {
    const u1 = construir(kit('lm741'), 'U1', { 'IN+': '0', 'IN-': 'n', OUT: 'out', 'V+': 'vcc', 'V-': 'vee' });
    const r = analizarTransitorio(
      {
        elementos: [
          fuente('VCC', 'vcc', 15),
          fuente('VEE', 'vee', -15),
          {
            tipo: 'fuenteVoltaje',
            nombre: 'VIN',
            positivo: 'in',
            negativo: '0',
            voltaje_v: 0,
            forma: { tipo: 'seno', desplazamiento: 0, amplitud: 0.5, frecuencia_hz: 1000 },
          },
          resistencia('R1', 'in', 'n', 1e3),
          resistencia('R2', 'n', 'out', 10e3),
          ...u1.elementos,
        ],
      },
      { tiempoFinal_s: 2e-3 },
    );
    // A mano: ganancia −10 → la salida es un seno de 5 V de pico, invertido.
    // A 1 kHz, el slew rate necesario es 2π·f·Vp = 2π · 1k · 5 = 0.031 V/µs, muy por debajo de 0.5 V/µs: no se deforma.
    const salida = r.voltajes.get('out')!;
    expect(Math.max(...salida)).toBeCloseTo(5, 1);
    expect(Math.min(...salida)).toBeCloseTo(-5, 1);
    const k = r.tiempos.findIndex((t) => t >= 0.25e-3); // cerca del pico positivo de la entrada
    expect(salida[k]!).toBeLessThan(-4.5);
  });
});
