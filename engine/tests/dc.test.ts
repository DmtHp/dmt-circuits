import { describe, expect, it } from 'vitest';
import type { Circuito } from '../src/circuito';
import { analizarDC, type ResultadoDC } from '../src/dc';
import { leerNetlist } from '../src/netlist';

function resolver(netlist: string): ResultadoDC {
  return analizarDC(leerNetlist(netlist));
}

function v(r: ResultadoDC, nodo: string): number {
  const valor = r.voltajes.get(nodo);
  if (valor === undefined) throw new Error(`No hay voltaje para el nodo ${nodo}.`);
  return valor;
}

function medida(r: ResultadoDC, nombre: string) {
  const m = r.elementos.get(nombre);
  if (!m) throw new Error(`No hay medidas para ${nombre}.`);
  return m;
}

/** Suma de potencias de todos los elementos: debe ser 0 (la energía se conserva). */
function potenciaTotal(r: ResultadoDC): number {
  let suma = 0;
  for (const m of r.elementos.values()) suma += m.potencia_w;
  return suma;
}

describe('análisis DC: circuitos con resistencias y fuentes independientes', () => {
  it('divisor de voltaje (el ejemplo del plan)', () => {
    const r = resolver(`
      V1 1 0 10
      R1 1 2 1k
      R2 2 0 2k
    `);
    // A mano: V2 = 10 · 2k / (1k + 2k) = 6.6667 V
    expect(v(r, '1')).toBeCloseTo(10, 9);
    expect(v(r, '2')).toBeCloseTo(6.666667, 6);
    expect(v(r, '0')).toBe(0);
    // I = 10 V / 3 kΩ = 3.3333 mA, de 1 a 2 por R1.
    expect(medida(r, 'R1').corriente_a).toBeCloseTo(3.333333e-3, 9);
    // La fuente la entrega: por dentro va de − a +, así que con la convención de SPICE es negativa.
    expect(medida(r, 'V1').corriente_a).toBeCloseTo(-3.333333e-3, 9);
    // Potencias: R1 = I²·R = (3.3333 mA)²·1k = 11.111 mW; R2 = 22.222 mW; V1 entrega 33.333 mW.
    expect(medida(r, 'R1').potencia_w).toBeCloseTo(11.111111e-3, 9);
    expect(medida(r, 'R2').potencia_w).toBeCloseTo(22.222222e-3, 9);
    expect(medida(r, 'V1').potencia_w).toBeCloseTo(-33.333333e-3, 9);
    expect(potenciaTotal(r)).toBeCloseTo(0, 12);
    // Incógnitas: V1, V2 y la corriente de V1 = 3.
    expect(r.incognitas).toBe(3);
  });

  it('acepta el circuito como objetos, sin netlist, y "gnd" como tierra', () => {
    const circuito: Circuito = {
      elementos: [
        { tipo: 'fuenteVoltaje', nombre: 'V1', positivo: 'a', negativo: 'gnd', voltaje_v: 12 },
        { tipo: 'resistencia', nombre: 'R1', a: 'a', b: 'b', resistencia_ohm: 330 },
        { tipo: 'resistencia', nombre: 'R2', a: 'b', b: 'GND', resistencia_ohm: 330 },
      ],
    };
    const r = analizarDC(circuito);
    // Dos resistencias iguales: la mitad, 6 V. I = 12 / 660 = 18.182 mA.
    expect(v(r, 'b')).toBeCloseTo(6, 9);
    expect(medida(r, 'R1').corriente_a).toBeCloseTo(12 / 660, 12);
  });

  it('puente de Wheatstone balanceado: no circula corriente por el centro', () => {
    const r = resolver(`
      V1 1 0 10
      R1 1 2 1k
      R2 2 0 2k
      R3 1 3 1k
      R4 3 0 2k
      RG 2 3 500
    `);
    // R1/R2 = R3/R4 = 1/2: ambas ramas dan 10 · 2k/3k = 6.6667 V, así que V2 = V3.
    expect(v(r, '2')).toBeCloseTo(6.666667, 6);
    expect(v(r, '3')).toBeCloseTo(6.666667, 6);
    expect(medida(r, 'RG').corriente_a).toBeCloseTo(0, 12);
  });

  it('puente de Wheatstone desbalanceado', () => {
    const r = resolver(`
      V1 1 0 10
      R1 1 2 1k
      R2 2 0 1k
      R3 1 3 1k
      R4 3 0 3k
      RG 2 3 1k
    `);
    // A mano, nodos 2 y 3 (todo en kΩ y mA):
    //   nodo 2: (V2−10)/1 + V2/1 + (V2−V3)/1 = 0  →  3·V2 − V3 = 10
    //   nodo 3: (V3−10)/1 + V3/3 + (V3−V2)/1 = 0  →  −V2 + (7/3)·V3 = 10
    // De la primera, V3 = 3·V2 − 10. Reemplazando: −V2 + 7·V2 − 70/3 = 10  →  6·V2 = 100/3
    //   V2 = 50/9 = 5.5556 V,  V3 = 50/3 − 10 = 20/3 = 6.6667 V
    //   I(RG) = (V2 − V3)/1k = (50/9 − 60/9)/1k = −1.1111 mA (va de 3 a 2)
    expect(v(r, '2')).toBeCloseTo(50 / 9, 9);
    expect(v(r, '3')).toBeCloseTo(20 / 3, 9);
    expect(medida(r, 'RG').corriente_a).toBeCloseTo(-10 / 9 / 1000, 12);
    expect(potenciaTotal(r)).toBeCloseTo(0, 12);
  });

  it('fuentes de corriente en paralelo se suman', () => {
    const r = resolver(`
      I1 0 1 2m
      I2 0 1 3m
      R1 1 0 1k
    `);
    // 2 mA + 3 mA = 5 mA entran al nodo 1 y salen por R1: V1 = 5 mA · 1 kΩ = 5 V.
    expect(v(r, '1')).toBeCloseTo(5, 9);
    // I1 va de 0 a 1 por dentro; su voltaje es V0 − V1 = −5 V: entrega 2 mA · 5 V = 10 mW.
    expect(medida(r, 'I1').potencia_w).toBeCloseTo(-10e-3, 12);
    expect(potenciaTotal(r)).toBeCloseTo(0, 12);
  });

  it('superposición: fuente de voltaje y fuente de corriente juntas', () => {
    const r = resolver(`
      V1 1 0 10
      R1 1 2 1k
      R2 2 0 1k
      I1 0 2 1m
    `);
    // Superposición:
    //   solo V1 (I1 abierta):  V2' = 10 · 1k/2k = 5 V
    //   solo I1 (V1 en corto): V2'' = 1 mA · (1k ∥ 1k) = 1 mA · 500 Ω = 0.5 V
    //   V2 = 5 + 0.5 = 5.5 V
    expect(v(r, '2')).toBeCloseTo(5.5, 9);
    // I(R1) = (10 − 5.5)/1k = 4.5 mA; I(R2) = 5.5 mA. Kirchhoff en el nodo 2: 4.5 + 1 = 5.5 ✓
    expect(medida(r, 'R1').corriente_a).toBeCloseTo(4.5e-3, 12);
    expect(medida(r, 'R2').corriente_a).toBeCloseTo(5.5e-3, 12);
    // Potencias: R1 20.25 mW + R2 30.25 mW − V1 45 mW − I1 5.5 mW = 0
    expect(medida(r, 'V1').potencia_w).toBeCloseTo(-45e-3, 12);
    expect(medida(r, 'I1').potencia_w).toBeCloseTo(-5.5e-3, 12);
    expect(potenciaTotal(r)).toBeCloseTo(0, 12);
  });

  it('escalera de 100 resistencias: resultado exacto y rápido', () => {
    const lineas = ['V1 1 0 10'];
    for (let k = 1; k < 100; k++) lineas.push(`R${k} ${k} ${k + 1} 1k`);
    lineas.push('R100 100 0 1k');
    const circuito = leerNetlist(lineas.join('\n'));

    analizarDC(circuito); // primera vuelta: el motor de JavaScript compila el código
    const inicio = performance.now();
    const r = analizarDC(circuito);
    const duracion_ms = performance.now() - inicio;

    // 100 resistencias de 1 kΩ en serie = 100 kΩ. I = 10 V / 100 kΩ = 0.1 mA.
    // Cada resistencia baja 0.1 V, así que Vk = 10 − (k − 1) · 0.1.
    expect(v(r, '1')).toBeCloseTo(10, 9);
    expect(v(r, '50')).toBeCloseTo(5.1, 9);
    expect(v(r, '100')).toBeCloseTo(0.1, 9);
    expect(medida(r, 'V1').corriente_a).toBeCloseTo(-0.1e-3, 12);
    // 101 incógnitas (100 nodos + la corriente de V1). Margen amplio para computadores modestos.
    expect(r.incognitas).toBe(101);
    expect(duracion_ms).toBeLessThan(50);
  });
});

describe('análisis DC: fuentes controladas', () => {
  it('VCVS como amplificador de ganancia 10', () => {
    const r = resolver(`
      V1 1 0 1
      E1 2 0 1 0 10
      RL 2 0 1k
    `);
    // V2 = 10 · V1 = 10 V. I(RL) = 10 V / 1k = 10 mA.
    expect(v(r, '2')).toBeCloseTo(10, 9);
    expect(medida(r, 'RL').corriente_a).toBeCloseTo(10e-3, 12);
    // La salida de E1 entrega esa corriente (negativa con la convención de SPICE).
    expect(medida(r, 'E1').corriente_a).toBeCloseTo(-10e-3, 12);
    // Por los terminales de control no circula corriente: V1 no entrega nada.
    expect(medida(r, 'V1').corriente_a).toBeCloseTo(0, 15);
  });

  it('VCVS con ganancia 100 000 como op-amp en configuración no inversora', () => {
    const r = resolver(`
      VIN entrada 0 1
      E1  salida 0 entrada menos 100k
      RF  salida menos 9k
      RG  menos 0 1k
    `);
    // Realimentación: β = RG / (RG + RF) = 1k / 10k = 0.1. Ganancia ideal = 1/β = 10.
    // Con ganancia finita A = 100 000:  Vsal = A / (1 + A·β) · Vin = 100000 / 10001 = 9.99900 V
    expect(v(r, 'salida')).toBeCloseTo(100000 / 10001, 9);
    // La entrada inversora queda casi igual a la no inversora ("cortocircuito virtual").
    expect(v(r, 'menos')).toBeCloseTo(10000 / 10001, 9);
  });

  it('VCCS: la corriente depende del voltaje de control', () => {
    const r = resolver(`
      V1 1 0 2
      G1 0 2 1 0 1m
      R1 2 0 1k
    `);
    // I = gm · V1 = 1 mS · 2 V = 2 mA, entra al nodo 2. V2 = 2 mA · 1 kΩ = 2 V.
    expect(medida(r, 'G1').corriente_a).toBeCloseTo(2e-3, 12);
    expect(v(r, '2')).toBeCloseTo(2, 9);
    expect(potenciaTotal(r)).toBeCloseTo(0, 12);
  });
});

describe('análisis DC: condensador y bobina', () => {
  it('la bobina es un corto en DC y se mide su corriente', () => {
    const r = resolver(`
      V1 1 0 10
      L1 1 2 10m
      R1 2 0 1k
    `);
    // Sin caída en L1: V2 = 10 V e I = 10 V / 1k = 10 mA.
    expect(v(r, '2')).toBeCloseTo(10, 9);
    expect(medida(r, 'L1').voltaje_v).toBeCloseTo(0, 12);
    expect(medida(r, 'L1').corriente_a).toBeCloseTo(10e-3, 12);
  });

  it('el condensador es un abierto en DC', () => {
    const r = resolver(`
      V1 1 0 10
      R1 1 2 1k
      C1 2 0 1u
    `);
    // No circula corriente, así que R1 no tiene caída: V2 = 10 V (el condensador cargado).
    expect(v(r, '2')).toBeCloseTo(10, 9);
    expect(medida(r, 'C1').corriente_a).toBe(0);
    expect(medida(r, 'R1').corriente_a).toBeCloseTo(0, 15);
  });
});

describe('análisis DC: errores con mensaje claro', () => {
  function errorDe(netlist: string) {
    try {
      resolver(netlist);
    } catch (error) {
      return error as { codigo: string; nodos: string[]; elementos: string[]; message: string };
    }
    throw new Error('Se esperaba un error y no hubo ninguno.');
  }

  it('nodos flotantes', () => {
    const e = errorDe(`
      V1 1 0 5
      R1 1 0 1k
      R2 3 4 1k
    `);
    expect(e.codigo).toBe('nodo_flotante');
    expect(e.nodos).toEqual(['3', '4']);
    expect(e.elementos).toEqual(['R2']);
  });

  it('fuente de corriente en serie con un abierto (un condensador en DC)', () => {
    const e = errorDe(`
      I1 0 1 1m
      C1 1 0 1u
    `);
    expect(e.codigo).toBe('nodo_flotante');
    expect(e.nodos).toEqual(['1']);
    expect(e.elementos).toEqual(['I1', 'C1']);
  });

  it('dos fuentes de voltaje en paralelo forman un bucle', () => {
    const e = errorDe(`
      V1 1 0 5
      V2 1 0 5
      R1 1 0 1k
    `);
    expect(e.codigo).toBe('bucle_fuentes_voltaje');
    expect(e.elementos).toEqual(['V1', 'V2']);
  });

  it('bucle de tres fuentes, aunque sus voltajes cuadren', () => {
    const e = errorDe(`
      V1 1 0 5
      V2 1 2 2
      V3 2 0 3
    `);
    expect(e.codigo).toBe('bucle_fuentes_voltaje');
    expect([...e.elementos].sort()).toEqual(['V1', 'V2', 'V3']);
  });

  it('una bobina en paralelo con una fuente de voltaje es un bucle en DC', () => {
    const e = errorDe(`
      V1 1 0 5
      L1 1 0 1m
    `);
    expect(e.codigo).toBe('bucle_fuentes_voltaje');
    expect(e.elementos).toEqual(['V1', 'L1']);
  });

  it('fuente con los dos terminales en el mismo nodo', () => {
    const e = errorDe(`
      V1 1 1 5
      R1 1 0 1k
    `);
    expect(e.codigo).toBe('bucle_fuentes_voltaje');
    expect(e.elementos).toEqual(['V1']);
  });

  it.each(['0', '-1k'])('resistencia de %s Ω', (valor) => {
    const e = errorDe(`
      V1 1 0 5
      R1 1 0 ${valor}
    `);
    expect(e.codigo).toBe('valor_invalido');
    expect(e.elementos).toEqual(['R1']);
  });

  it('circuito sin tierra', () => {
    const e = errorDe(`
      V1 1 2 5
      R1 1 2 1k
    `);
    expect(e.codigo).toBe('sin_tierra');
  });

  it('nombres repetidos (sin distinguir mayúsculas)', () => {
    const e = errorDe(`
      R1 1 0 1k
      r1 1 0 2k
    `);
    expect(e.codigo).toBe('nombre_repetido');
  });

  it('circuito vacío', () => {
    expect(errorDe('* solo un comentario').codigo).toBe('circuito_vacio');
  });

  it('fuente controlada que se controla a sí misma sin solución única', () => {
    // E1 dice V2 = 1 · V2, que se cumple para cualquier V2: la ecuación queda 0 = 0.
    const e = errorDe(`
      E1 2 0 2 0 1
      R1 2 0 1k
    `);
    expect(e.codigo).toBe('matriz_singular');
    expect(e.elementos).toEqual(['E1']);
  });
});
