import { useState } from 'react';
import { corrienteOhm } from '../../engine/src/ohm';

/** Página mínima de la Etapa 0: comprueba que la interfaz puede usar el motor. */
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
      <p>Simulador de circuitos en construcción. Etapa 0: proyecto configurado.</p>
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
