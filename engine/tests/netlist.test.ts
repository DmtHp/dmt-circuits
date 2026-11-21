import { describe, expect, it } from 'vitest';
import { ErrorCircuito } from '../src/errores';
import { leerNetlist, leerValor } from '../src/netlist';

describe('leerValor (números con sufijo SPICE)', () => {
  it.each([
    ['1000', 1000],
    ['1k', 1e3],
    ['4.7k', 4.7e3],
    ['2meg', 2e6],
    ['2MEG', 2e6],
    ['2.2M', 2.2e-3], // M es mili, como en SPICE
    ['10m', 10e-3],
    ['4.7u', 4.7e-6],
    ['4.7µ', 4.7e-6],
    ['100n', 100e-9],
    ['22p', 22e-12],
    ['1e3', 1000],
    ['.5', 0.5],
    ['-5', -5],
  ])('"%s" vale %d', (texto, esperado) => {
    const valor = leerValor(texto);
    expect(valor).not.toBeNull();
    expect(valor! / esperado).toBeCloseTo(1, 12);
  });

  it.each(['10uF', '1kohm', 'abc', '', 'k', '1..2'])('rechaza "%s"', (texto) => {
    expect(leerValor(texto)).toBeNull();
  });
});

describe('leerNetlist', () => {
  it('lee cada tipo de elemento', () => {
    const { elementos } = leerNetlist(`
      * Comentario
      V1 1 0 DC 5     ; fuente con la palabra DC
      I1 0 2 1m
      R1 1 2 1k
      C1 2 gnd 100n
      L1 2 3 10m
      E1 4 0 1 2 10
      G1 0 5 1 0 2m
    `);
    expect(elementos.map((e) => e.tipo)).toEqual([
      'fuenteVoltaje',
      'fuenteCorriente',
      'resistencia',
      'condensador',
      'bobina',
      'vcvs',
      'vccs',
    ]);
    expect(elementos[0]).toEqual({ tipo: 'fuenteVoltaje', nombre: 'V1', positivo: '1', negativo: '0', voltaje_v: 5 });
    expect(elementos[5]).toEqual({
      tipo: 'vcvs',
      nombre: 'E1',
      positivo: '4',
      negativo: '0',
      controlPositivo: '1',
      controlNegativo: '2',
      ganancia: 10,
    });
  });

  it('se detiene en .end', () => {
    const { elementos } = leerNetlist('R1 1 0 1k\n.end\nesto no se lee');
    expect(elementos).toHaveLength(1);
  });

  function errorDe(texto: string): ErrorCircuito {
    try {
      leerNetlist(texto);
    } catch (error) {
      if (error instanceof ErrorCircuito) return error;
      throw error;
    }
    throw new Error('Se esperaba un error y no hubo ninguno.');
  }

  it('señala la línea de un elemento desconocido', () => {
    const error = errorDe('R1 1 0 1k\nQ1 1 2 3');
    expect(error.codigo).toBe('netlist');
    expect(error.linea).toBe(2);
  });

  it('señala un valor con unidad pegada', () => {
    const error = errorDe('C1 1 0 10uF');
    expect(error.linea).toBe(1);
    expect(error.message).toContain('10uF');
  });

  it('señala campos de más o de menos', () => {
    expect(errorDe('R1 1 0').codigo).toBe('netlist');
    expect(errorDe('R1 1 0 1k 2k').codigo).toBe('netlist');
  });

  it('rechaza directivas que todavía no existen', () => {
    expect(errorDe('.tran 1m 10m').codigo).toBe('netlist');
  });
});
