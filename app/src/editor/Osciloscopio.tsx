/**
 * Osciloscopio sencillo de dos canales. Muestra los últimos 10 cuadros
 * (divisiones) de tiempo de las sondas CH1 y CH2, como un osciloscopio en
 * modo "rodando" (roll).
 */

import { useState } from 'react';
import type { Historial } from '../sim/useSimulador';
import { conPrefijo } from '../modelo/avisos';

const DIVISIONES_X = 10;
const DIVISIONES_Y = 8;
const ANCHO = 500;
const ALTO = 320;

const ESCALAS_TIEMPO = [1e-6, 2e-6, 5e-6, 10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6, 1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 0.1, 0.2, 0.5, 1];
const ESCALAS_VOLTAJE = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];

interface Props {
  historial: Historial;
  /** Nodo conectado a cada canal (o undefined si no hay sonda). */
  canales: [string | undefined, string | undefined];
  /** Cambia cuando llegan datos nuevos (para redibujar). */
  version: number;
}

export function Osciloscopio({ historial, canales }: Props) {
  const [tiempoDiv, setTiempoDiv] = useState(1e-3);
  const [voltajeDiv, setVoltajeDiv] = useState<[number, number]>([2, 2]);

  const { tiempos } = historial;
  const tFin = tiempos.at(-1) ?? 0;
  const tInicio = tFin - DIVISIONES_X * tiempoDiv;
  // Primer índice dentro de la ventana (búsqueda binaria).
  let bajo = 0;
  let alto = tiempos.length;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1;
    if (tiempos[medio]! < tInicio) bajo = medio + 1;
    else alto = medio;
  }

  const trazo = (nodo: string | undefined, canal: 0 | 1): string => {
    if (!nodo) return '';
    const valores = historial.valores.get(nodo);
    if (!valores) return '';
    const escala = voltajeDiv[canal];
    const puntos: string[] = [];
    // Como mucho ~2 puntos por píxel.
    const salto = Math.max(1, Math.floor((tiempos.length - bajo) / (ANCHO * 2)));
    for (let k = bajo; k < tiempos.length; k += salto) {
      const x = ((tiempos[k]! - tInicio) / (DIVISIONES_X * tiempoDiv)) * ANCHO;
      const y = ALTO / 2 - (valores[k]! / escala) * (ALTO / DIVISIONES_Y);
      puntos.push(`${x.toFixed(1)},${Math.max(-5, Math.min(ALTO + 5, y)).toFixed(1)}`);
    }
    return puntos.join(' ');
  };

  const ultimo = (nodo: string | undefined): string => {
    const v = nodo ? historial.valores.get(nodo)?.at(-1) : undefined;
    return v === undefined ? '—' : conPrefijo(v, 'V');
  };

  return (
    <section className="osciloscopio" aria-label="Osciloscopio">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="pantalla-osciloscopio">
        {Array.from({ length: DIVISIONES_X + 1 }, (_, i) => (
          <line key={`x${i}`} x1={(i * ANCHO) / DIVISIONES_X} y1={0} x2={(i * ANCHO) / DIVISIONES_X} y2={ALTO} className={i === DIVISIONES_X / 2 ? 'reticula eje' : 'reticula'} />
        ))}
        {Array.from({ length: DIVISIONES_Y + 1 }, (_, i) => (
          <line key={`y${i}`} x1={0} y1={(i * ALTO) / DIVISIONES_Y} x2={ANCHO} y2={(i * ALTO) / DIVISIONES_Y} className={i === DIVISIONES_Y / 2 ? 'reticula eje' : 'reticula'} />
        ))}
        <polyline points={trazo(canales[0], 0)} className="traza canal1" />
        <polyline points={trazo(canales[1], 1)} className="traza canal2" />
      </svg>
      <div className="controles-osciloscopio">
        <label>
          Tiempo/div
          <select value={tiempoDiv} onChange={(e) => setTiempoDiv(Number(e.target.value))}>
            {ESCALAS_TIEMPO.map((t) => (
              <option key={t} value={t}>
                {conPrefijo(t, 's')}
              </option>
            ))}
          </select>
        </label>
        {([0, 1] as const).map((c) => (
          <label key={c} className={`canal${c + 1}`}>
            CH{c + 1} V/div
            <select
              value={voltajeDiv[c]}
              onChange={(e) => setVoltajeDiv((v) => (c === 0 ? [Number(e.target.value), v[1]] : [v[0], Number(e.target.value)]))}
            >
              {ESCALAS_VOLTAJE.map((v) => (
                <option key={v} value={v}>
                  {conPrefijo(v, 'V')}
                </option>
              ))}
            </select>
            <span className="valor-canal">{canales[c] ? ultimo(canales[c]) : 'sin sonda'}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
