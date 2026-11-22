import { describe, expect, it } from 'vitest';
import { archivosBiblioteca } from '../src/biblioteca';
import { validarComponente } from '../src/validar';

/**
 * Cada componente del kit debe pasar los tres filtros: formato, reglas de su
 * categoría y sus pruebas contra el datasheet. Si alguien cambia un modelo y
 * deja de cumplir el datasheet, esta prueba falla y dice cuál y por qué.
 */
describe('biblioteca del kit', () => {
  const archivos = [...archivosBiblioteca().entries()];

  it('tiene los componentes del kit básico', () => {
    const nombres = archivos.map(([nombre]) => nombre);
    for (const esperado of [
      'resistencia.json',
      'potenciometro.json',
      'condensador.json',
      'bobina.json',
      'interruptor.json',
      '1n4148.json',
      '1n4007.json',
      'led_rojo_5mm.json',
      '1n4733a.json',
      'opamp_generico.json',
      'lm358.json',
      'lm324.json',
      'lm741.json',
      '74hc00.json',
    ]) {
      expect(nombres).toContain(esperado);
    }
  });

  it.each(archivos)('%s pasa los tres filtros', (nombre, contenido) => {
    const r = validarComponente(contenido);
    const fallas = [
      ...r.filtros.formato.errores,
      ...r.filtros.categoria.errores,
      ...r.filtros.electrico.errores,
    ].map((e) => `${e.ruta}: ${e.mensaje}`);
    expect(fallas, nombre).toEqual([]);
    expect(r.aceptado).toBe(true);
    // El nombre del archivo es el id del componente.
    expect(`${r.componente?.id}.json`).toBe(nombre);
  });
});
