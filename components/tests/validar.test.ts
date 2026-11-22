import { describe, expect, it } from 'vitest';
import { BIBLIOTECA } from '../src/biblioteca';
import { detectarCategoria } from '../src/detectar';
import { pinesDeEncapsulado, validarComponente } from '../src/validar';

/** Copia profunda de un componente del kit, para modificarlo en una prueba. */
function copiaDe(id: string): Record<string, unknown> {
  const c = BIBLIOTECA.get(id);
  if (!c) throw new Error(`No está ${id} en la biblioteca.`);
  return JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
}

function mensajes(r: ReturnType<typeof validarComponente>): string {
  return [...r.filtros.formato.errores, ...r.filtros.categoria.errores, ...r.filtros.electrico.errores]
    .map((e) => `${e.ruta}: ${e.mensaje}`)
    .join('\n');
}

describe('filtro 1: formato', () => {
  it('rechaza un programa de Python con un mensaje que lo dice', () => {
    const r = validarComponente('import math\n\ndef area(r):\n    return math.pi * r ** 2\n\nprint(area(2))');
    expect(r.aceptado).toBe(false);
    expect(r.filtros.formato.estado).toBe('no_pasa');
    expect(r.filtros.categoria.estado).toBe('no_evaluado');
    expect(mensajes(r)).toContain('parece un programa');
  });

  it('rechaza JSON mal escrito', () => {
    const r = validarComponente('{ "formato": "1.0", }');
    expect(r.filtros.formato.estado).toBe('no_pasa');
    expect(mensajes(r)).toContain('No es un JSON válido');
  });

  it('acepta el JSON dentro de un bloque de código ``` como lo devuelven las IA', () => {
    const texto = '```json\n' + JSON.stringify(BIBLIOTECA.get('1n4148')) + '\n```';
    expect(validarComponente(texto).aceptado).toBe(true);
  });

  it('rechaza algo que no es un objeto', () => {
    expect(mensajes(validarComponente('[1, 2, 3]'))).toContain('es una lista');
  });

  it('señala campos faltantes, tipos equivocados y sugiere el nombre correcto', () => {
    const c = copiaDe('1n4148');
    delete c.nombre;
    c.pins = c.pines;
    delete c.pines;
    c.fidelidad = 'comportamento';
    const texto = mensajes(validarComponente(c));
    expect(texto).toContain('nombre: Falta este campo');
    expect(texto).toContain('pins: Campo desconocido. ¿Quisiste decir "pines"?');
    expect(texto).toContain('¿Quisiste decir "comportamiento"?');
  });

  it('pide números sin comillas', () => {
    const c = copiaDe('lm358');
    (c.pines as { n: unknown }[])[0]!.n = '1';
    expect(mensajes(validarComponente(c))).toContain('Escribe el número sin comillas');
  });
});

describe('filtro 2: reglas de la categoría', () => {
  it('el encapsulado debe coincidir con la cantidad de pines', () => {
    const c = copiaDe('lm358');
    c.encapsulado = 'DIP-14';
    const r = validarComponente(c);
    expect(r.filtros.formato.estado).toBe('pasa');
    expect(r.filtros.categoria.estado).toBe('no_pasa');
    expect(mensajes(r)).toContain('DIP-14 tiene 14 pines, pero la lista de pines tiene 8');
  });

  it('rechaza una plantilla que no existe y sugiere la correcta', () => {
    const c = copiaDe('lm358');
    (c.modelo as { bloques: { usa: string }[] }).bloques[0]!.usa = 'opamp_basic';
    expect(mensajes(validarComponente(c))).toContain('¿Quisiste decir "opamp_basico"?');
  });

  it('rechaza parámetros fuera de rango físico (ganancia negativa)', () => {
    const c = copiaDe('lm358');
    (c.modelo as { bloques: { parametros: Record<string, unknown> }[] }).bloques[0]!.parametros.ganancia = -5;
    expect(mensajes(validarComponente(c))).toContain('el mínimo razonable es 100');
  });

  it('rechaza una alimentación de 5000 V en una prueba', () => {
    const c = copiaDe('lm358');
    (c.pruebas as Record<string, unknown>[])[0]!.alimentacion_v = 5000;
    expect(mensajes(validarComponente(c))).toContain('el máximo razonable es 50 V');
  });

  it('exige parámetros obligatorios de la plantilla', () => {
    const c = copiaDe('lm358');
    delete (c.modelo as { bloques: { parametros: Record<string, unknown> }[] }).bloques[0]!.parametros.slew_v_us;
    expect(mensajes(validarComponente(c))).toContain('Falta el parámetro "slew_v_us"');
  });

  it('un bloque no puede usar pines que no existen', () => {
    const c = copiaDe('lm358');
    (c.modelo as { bloques: { pines: string[] }[] }).bloques[0]!.pines[0] = 'IN1P';
    expect(mensajes(validarComponente(c))).toContain('El pin "IN1P" no está en la lista de pines');
  });

  it('exige la fuente del datasheet en las pruebas de un modelo de comportamiento', () => {
    const c = copiaDe('1n4148');
    delete (c.pruebas as Record<string, unknown>[])[0]!.fuente;
    expect(mensajes(validarComponente(c))).toContain('Indica de dónde sale el valor esperado');
  });

  it('revisa los campos de cada prueba', () => {
    const c = copiaDe('1n4148');
    const prueba = (c.pruebas as Record<string, unknown>[])[0]!;
    prueba.corriente = prueba.corriente_a;
    delete prueba.corriente_a;
    const texto = mensajes(validarComponente(c));
    expect(texto).toContain('¿Quisiste decir "corriente_a"?');
    expect(texto).toContain('Falta este campo: Corriente directa IF');
  });

  it('revisa expresiones con variables desconocidas', () => {
    const c = copiaDe('lm358');
    (c.pruebas as Record<string, unknown>[])[1]!.esperado_v = 'VDD - 1.5';
    expect(mensajes(validarComponente(c))).toContain('No conozco "VDD"');
  });

  it('una tabla de verdad incompleta no pasa', () => {
    const c = copiaDe('74hc00');
    const unidad = (c.modelo as { unidades: Record<string, unknown>[] }).unidades[0]!;
    delete unidad.funcion;
    unidad.tabla = ['00:1', '01:1', '11:0'];
    expect(mensajes(validarComponente(c))).toContain('faltan 10');
  });

  it('las líneas de netlist del modelo se revisan con el lector del motor', () => {
    const c = copiaDe('resistencia');
    (c.modelo as Record<string, unknown>).netlist = ['R9 A B 10uF'];
    expect(mensajes(validarComponente(c))).toContain('modelo.netlist[0]');
  });
});

describe('filtro 3: prueba eléctrica', () => {
  it('si la IA inventa un parámetro, la prueba contra el datasheet lo delata', () => {
    // Slew rate de 3 V/µs en vez de 0.3: el datasheet del LM358 dice 0.3 V/µs típico.
    const c = copiaDe('lm358');
    for (const b of (c.modelo as { bloques: { parametros: Record<string, unknown> }[] }).bloques) b.parametros.slew_v_us = 3;
    const r = validarComponente(c);
    expect(r.filtros.categoria.estado).toBe('pasa');
    expect(r.filtros.electrico.estado).toBe('no_pasa');
    expect(r.aceptado).toBe(false);
    const slew = r.filtros.electrico.pruebas.filter((p) => p.tipo === 'slew_rate');
    expect(slew.every((p) => p.estado === 'no_pasa')).toBe(true);
    expect(r.textoParaIA).toContain('Ajusta los parámetros del modelo');
    expect(r.textoParaIA).toContain('Slew rate');
  });

  it('un diodo con Is mal puesto no cumple el VF del datasheet', () => {
    // Con Is = 1e-15 A (en vez de 2.52e-9), VF a 10 mA sube a unos 1.6 V > 1 V máx.
    const c = copiaDe('1n4148');
    (c.modelo as { bloques: { parametros: Record<string, unknown> }[] }).bloques[0]!.parametros.is_a = 1e-15;
    const r = validarComponente(c);
    expect(r.filtros.electrico.estado).toBe('no_pasa');
    expect(r.filtros.electrico.pruebas[0]!.estado).toBe('no_pasa');
  });

  it('el resumen para la tarjeta de confirmación', () => {
    expect(validarComponente(BIBLIOTECA.get('lm324')).resumen).toBe('Detecté: amplificador operacional, 4 unidades, DIP-14');
    expect(validarComponente(BIBLIOTECA.get('1n4733a')).resumen).toBe('Detecté: diodo, zener de 5.1 V, DO-41');
  });
});

describe('detección de categoría', () => {
  it('deduce la categoría si falta y lo avisa', () => {
    const c = copiaDe('lm358');
    delete c.categoria;
    const r = validarComponente(c);
    expect(r.categoriaDetectada).toBe(true);
    expect(r.categoria).toBe('amplificador_operacional');
    expect(r.aceptado).toBe(true);
    expect(r.avisos.join(' ')).toContain('no declara su categoría');
  });

  it('por los pines, sin plantillas', () => {
    expect(
      detectarCategoria({ pines: [{ nombre: 'IN+' }, { nombre: 'IN-' }, { nombre: 'OUT' }, { nombre: 'V+' }, { nombre: 'V-' }] }).categoria,
    ).toBe('amplificador_operacional');
    expect(detectarCategoria({ pines: [{ nombre: 'A' }, { nombre: 'K' }] }).categoria).toBe('diodo');
    expect(detectarCategoria({ modelo: { tipo: 'logico' } }).categoria).toBe('compuerta_logica');
  });

  it('si no hay pistas, no inventa una categoría', () => {
    const d = detectarCategoria({ nombre: 'algo' });
    expect(d.categoria).toBeNull();
    expect(d.candidatas).toEqual([]);
  });
});

describe('encapsulados', () => {
  it.each([
    ['DIP-8', 8],
    ['dip-14', 14],
    ['SOIC-8', 8],
    ['TO-92', 3],
    ['SOT-23-5', 5],
    ['DO-41', 2],
    ['LED-5mm', 2],
    ['axial', 2],
  ])('%s tiene %d pines', (encapsulado, pines) => {
    expect(pinesDeEncapsulado(encapsulado)).toBe(pines);
  });

  it('no conoce encapsulados inventados', () => {
    expect(pinesDeEncapsulado('XYZ-99')).toBeNull();
  });
});
