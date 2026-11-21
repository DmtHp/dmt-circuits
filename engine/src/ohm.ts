/**
 * Ejemplo de la Etapa 0: ley de Ohm, I = V / R.
 * Sirve para comprobar que las pruebas funcionan. El motor real (MNA) empieza en la Etapa 1.
 *
 * @param voltaje_v Voltaje sobre la resistencia, en voltios.
 * @param resistencia_ohm Resistencia, en ohmios. Debe ser mayor que cero.
 * @returns Corriente, en amperios.
 */
export function corrienteOhm(voltaje_v: number, resistencia_ohm: number): number {
  if (!(resistencia_ohm > 0)) {
    throw new RangeError(`La resistencia debe ser mayor que 0 Ω (recibí ${resistencia_ohm} Ω).`);
  }
  return voltaje_v / resistencia_ohm;
}
