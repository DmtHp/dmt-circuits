import { describe, expect, it } from 'vitest';
import { BIBLIOTECA } from '../../components/src';
import { analizarDC } from '../../engine/src';
import { armarCircuito, R_VOLTIMETRO_OHM } from '../src/modelo/conectividad';
import { agregarCables, DOCUMENTO_VACIO, type Documento, type Pieza } from '../src/modelo/documento';
import { calcularAvisos } from '../src/modelo/avisos';
import { EJEMPLOS } from '../src/modelo/ejemplos';

function pieza(p: Partial<Pieza> & Pick<Pieza, 'id' | 'tipo' | 'nombre' | 'x' | 'y'>): Pieza {
  return { rotacion: 0, parametros: {}, ...p };
}

/**
 * Divisor dibujado en el lienzo (coordenadas de rejilla):
 *
 *   V1 (+ en 0,0 / − en 0,4)
 *   R1 de (4,0) a (8,0), R2 de (8,4) a (12,4) girada… mejor: R2 vertical de (8,0) a (8,4) (rotación 1)
 *   tierra en (0,4)
 */
function divisor(): Documento {
  let doc: Documento = {
    ...DOCUMENTO_VACIO,
    piezas: [
      pieza({ id: 'v1', tipo: 'fuente_dc', nombre: 'V1', x: 0, y: 0, parametros: { voltaje_v: 10 } }),
      pieza({ id: 'r1', tipo: 'componente', componenteId: 'resistencia', nombre: 'R1', x: 4, y: 0, parametros: { resistencia_ohm: 1000 } }),
      // Rotada 90°: sus pines quedan en (8,0) y (8,4).
      pieza({ id: 'r2', tipo: 'componente', componenteId: 'resistencia', nombre: 'R2', x: 8, y: 0, rotacion: 1, parametros: { resistencia_ohm: 2000 } }),
      pieza({ id: 'g', tipo: 'tierra', nombre: 'GND1', x: 0, y: 4 }),
    ],
  };
  doc = agregarCables(doc, [
    { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, // V1+ → R1
    { a: { x: 8, y: 4 }, b: { x: 0, y: 4 } }, // R2 abajo → tierra
  ]);
  return doc;
}

describe('del lienzo al circuito', () => {
  it('un divisor dibujado da el resultado calculado a mano', () => {
    const armado = armarCircuito(divisor(), BIBLIOTECA);
    expect(armado.problemas).toEqual([]);
    const r = analizarDC({ elementos: armado.elementos });
    // R1 y R2 se tocan en (8,0) sin cable: el mismo punto de la rejilla los une.
    // A mano: V(medio) = 10 · 2k / (1k + 2k) = 6.667 V
    const medio = armado.nodoDePin.get('r1:B')!;
    expect(armado.nodoDePin.get('r2:A')).toBe(medio);
    expect(r.voltajes.get(medio)).toBeCloseTo(20 / 3, 6);
    expect(armado.nodoDePin.get('v1:-')).toBe('0');
  });

  it('un cable que pasa por encima de un pin no lo conecta', () => {
    let doc = divisor();
    // Voltímetro con sus pines en (14,0) y (18,0); un cable de (12,0) a (20,0) pasa por encima de ambos.
    doc = { ...doc, piezas: [...doc.piezas, pieza({ id: 'vm', tipo: 'voltimetro', nombre: 'VM1', x: 14, y: 0 })] };
    doc = agregarCables(doc, [{ a: { x: 12, y: 0 }, b: { x: 20, y: 0 } }]);
    const armado = armarCircuito(doc, BIBLIOTECA);
    expect(armado.pinesLibres.map((p) => `${p.pieza}:${p.pin}`)).toEqual(['vm:+', 'vm:-']);
  });

  it('un extremo de cable sobre otro cable hace una unión en T', () => {
    let doc = divisor();
    // Voltímetro de (8,-4) a (12,-4); su + baja con un cable hasta (8,0)? No: lo unimos en T al cable V1–R1, en (2,0).
    doc = { ...doc, piezas: [...doc.piezas, pieza({ id: 'vm', tipo: 'voltimetro', nombre: 'VM1', x: 2, y: -4 })] };
    doc = agregarCables(doc, [
      { a: { x: 2, y: -4 }, b: { x: 2, y: 0 } }, // termina en medio del cable (0,0)–(4,0)
      { a: { x: 6, y: -4 }, b: { x: 6, y: -6 } }, // el − queda conectado a un cable suelto
    ]);
    const armado = armarCircuito(doc, BIBLIOTECA);
    expect(armado.nodoDePin.get('vm:+')).toBe(armado.nodoDePin.get('v1:+'));
    // El voltímetro es una resistencia de 10 MΩ: el motor la ve.
    expect(armado.elementos).toContainEqual({ tipo: 'resistencia', nombre: 'VM1', a: armado.nodoDePin.get('v1:+'), b: armado.nodoDePin.get('vm:-'), resistencia_ohm: R_VOLTIMETRO_OHM });
  });

  it('avisa cuando un LED recibe demasiada corriente', () => {
    // 10 V sobre un LED con solo 100 Ω: I ≈ (10 − 2)/100 = 80 mA > 30 mA.
    let doc: Documento = {
      ...DOCUMENTO_VACIO,
      piezas: [
        pieza({ id: 'v1', tipo: 'fuente_dc', nombre: 'V1', x: 0, y: 0, parametros: { voltaje_v: 10 } }),
        pieza({ id: 'r1', tipo: 'componente', componenteId: 'resistencia', nombre: 'R1', x: 0, y: 0, parametros: { resistencia_ohm: 100 } }),
        pieza({ id: 'd1', tipo: 'componente', componenteId: 'led_rojo_5mm', nombre: 'D1', x: 4, y: 0, rotacion: 1 }),
        pieza({ id: 'g', tipo: 'tierra', nombre: 'GND1', x: 0, y: 4 }),
      ],
    };
    doc = agregarCables(doc, [{ a: { x: 4, y: 4 }, b: { x: 0, y: 4 } }]);
    const armado = armarCircuito(doc, BIBLIOTECA);
    const r = analizarDC({ elementos: armado.elementos });
    const avisos = calcularAvisos(doc, armado, r, BIBLIOTECA);
    const led = avisos.find((a) => a.pieza === 'd1');
    expect(led?.nivel).toBe('peligro');
    expect(led?.mensaje).toContain('se quemaría');
    // La resistencia de 1/4 W también: P ≈ 0.08² · 100 = 0.64 W.
    expect(avisos.find((a) => a.pieza === 'r1')?.mensaje).toContain('disipa');
  });
});

describe('ejemplos', () => {
  it.each(EJEMPLOS.map((e) => [e.titulo, e] as const))('"%s" se arma y simula sin errores', (_, ejemplo) => {
    const armado = armarCircuito(ejemplo.documento, BIBLIOTECA);
    expect(armado.problemas).toEqual([]);
    expect(() => analizarDC({ elementos: armado.elementos })).not.toThrow();
  });

  it('en el comparador, con el cursor al 30 % la salida está baja y al 70 % alta', () => {
    const doc = EJEMPLOS.find((e) => e.titulo.includes('Comparador'))!.documento;
    const salida = (posicion: number): number => {
      const conPosicion = { ...doc, piezas: doc.piezas.map((p) => (p.id === 'e3pot' ? { ...p, parametros: { ...p.parametros, posicion } } : p)) };
      const armado = armarCircuito(conPosicion, BIBLIOTECA);
      // A mano: IN1+ = 5 V · posición (1.5 V o 3.5 V) contra IN1− = 2.5 V.
      expect(armado.nodoDePin.get('e3pot:W')).toBe(armado.nodoDePin.get('e3u:IN1+'));
      return analizarDC({ elementos: armado.elementos }).voltajes.get(armado.nodoDePin.get('e3u:OUT1')!)!;
    };
    expect(salida(0.3)).toBeCloseTo(0, 1);
    // Saturación alta del LM358 con 5 V: VCC − 1.5 V = 3.5 V.
    expect(salida(0.7)).toBeCloseTo(3.5, 1);
  });

  it('en el LED con interruptor, al cerrar SW1 pasan unos 9 mA', () => {
    const doc = EJEMPLOS[0]!.documento;
    const corriente = (cerrado: number): number => {
      const d = { ...doc, piezas: doc.piezas.map((p) => (p.id === 'e1s' ? { ...p, parametros: { cerrado } } : p)) };
      const armado = armarCircuito(d, BIBLIOTECA);
      return analizarDC({ elementos: armado.elementos }).elementos.get('AM1')!.corriente_a;
    };
    expect(Math.abs(corriente(0))).toBeLessThan(1e-6);
    // A mano: (5 V − 2.0 V del LED) / (330 Ω + 0.1 Ω del amperímetro) ≈ 9.1 mA
    expect(corriente(1)).toBeGreaterThan(8.5e-3);
    expect(corriente(1)).toBeLessThan(9.5e-3);
  });
});
