import { useState } from 'react';
import { analizarDC } from '../../engine/src';

/**
 * Página mínima: comprueba que la interfaz puede usar el motor.
 * Desde la Etapa 1 la corriente sale del análisis DC (MNA) de una fuente y una resistencia.
 */
function corrienteOhm(voltaje_v: number, resistencia_ohm: number): number {
  const resultado = analizarDC({
    elementos: [
      { tipo: 'fuenteVoltaje', nombre: 'V1', positivo: '1', negativo: '0', voltaje_v },
      { tipo: 'resistencia', nombre: 'R1', a: '1', b: '0', resistencia_ohm },
    ],
  });
  return resultado.elementos.get('R1')?.corriente_a ?? Number.NaN;
}

export function App() {
  const [voltaje, setVoltaje] = useState(5);
  const [resistencia, setResistencia] = useState(1000);

  let resultado: string;
  try {
    resultado = `${(corrienteOhm(voltaje, resistencia) * 1000).toFixed(3)} mA`;
  } catch (error) {
    resultado = error instanceof Error ? error.message : 'Error';
  }

  return (
    <main>
      <h1>DMT Circuits</h1>
      <p>Simulador de circuitos en construcción. Etapa 1: motor DC lineal (MNA).</p>
      <section>
        <h2>Ley de Ohm</h2>
        <label>
          Voltaje (V)
          <input type="number" value={voltaje} onChange={(e) => setVoltaje(e.target.valueAsNumber)} />
        </label>
        <label>
          Resistencia (Ω)
          <input type="number" value={resistencia} onChange={(e) => setResistencia(e.target.valueAsNumber)} />
        </label>
        <p className="resultado">
          I = V / R = <strong>{resultado}</strong>
        </p>
      </section>
    </main>
  );
}
