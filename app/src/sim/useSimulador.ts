/**
 * Puente entre React y el worker del simulador.
 *
 * Las lecturas llegan ~60 veces por segundo; para no redibujar todo cada vez,
 * se guardan en una referencia y la pantalla se actualiza como mucho una vez
 * por cuadro (requestAnimationFrame).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Elemento } from '../../../engine/src';
import type { MedidaPlana, MensajeAlWorker, MensajeDelWorker } from './protocolo';

export interface Lecturas {
  tiempo_s: number;
  voltajes: Map<string, number>;
  elementos: Map<string, MedidaPlana>;
  atrasado: boolean;
  pasosPorSegundo: number;
}

export interface ErrorSimulacion {
  mensaje: string;
  nodos: string[];
  elementos: string[];
}

/** Historial de un nodo para el osciloscopio: tiempos y voltajes (se recorta a una ventana). */
export interface Historial {
  tiempos: number[];
  valores: Map<string, number[]>;
}

const MAXIMO_HISTORIAL = 20000;

export function useSimulador() {
  const worker = useRef<Worker | null>(null);
  const idActual = useRef(0);
  const ultimas = useRef<Lecturas | null>(null);
  const historial = useRef<Historial>({ tiempos: [], valores: new Map() });
  const pendienteCuadro = useRef<number | null>(null);
  const [lecturas, setLecturas] = useState<Lecturas | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<ErrorSimulacion | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const w = new Worker(new URL('./simulador.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (evento: MessageEvent<MensajeDelWorker>) => {
      const m = evento.data;
      if (m.id !== idActual.current) return;
      if (m.tipo === 'error') {
        setError({ mensaje: m.mensaje, nodos: m.nodos, elementos: m.elementos });
        setCorriendo(false);
        return;
      }
      ultimas.current = {
        tiempo_s: m.tiempo_s,
        voltajes: new Map(m.voltajes),
        elementos: new Map(m.elementos),
        atrasado: m.atrasado,
        pasosPorSegundo: m.pasosPorSegundo,
      };
      const h = historial.current;
      h.tiempos.push(...m.serie.tiempos);
      for (const [nodo, valores] of Object.entries(m.serie.nodos)) {
        const lista = h.valores.get(nodo) ?? [];
        lista.push(...valores);
        h.valores.set(nodo, lista);
      }
      if (h.tiempos.length > MAXIMO_HISTORIAL) {
        const sobra = h.tiempos.length - MAXIMO_HISTORIAL;
        h.tiempos.splice(0, sobra);
        for (const lista of h.valores.values()) lista.splice(0, sobra);
      }
      if (pendienteCuadro.current === null) {
        pendienteCuadro.current = requestAnimationFrame(() => {
          pendienteCuadro.current = null;
          setLecturas(ultimas.current);
          setVersion((v) => v + 1);
        });
      }
    };
    return () => {
      w.terminate();
      worker.current = null;
      if (pendienteCuadro.current !== null) cancelAnimationFrame(pendienteCuadro.current);
    };
  }, []);

  const enviar = (m: MensajeAlWorker): void => worker.current?.postMessage(m);

  const iniciar = useCallback((elementos: Elemento[], velocidad: number, nodosSonda: string[]) => {
    idActual.current++;
    historial.current = { tiempos: [], valores: new Map(nodosSonda.map((n) => [n, []])) };
    ultimas.current = null;
    setLecturas(null);
    setError(null);
    setCorriendo(true);
    enviar({ tipo: 'iniciar', id: idActual.current, elementos, velocidad, nodosSonda });
  }, []);

  const actualizar = useCallback((elementos: Elemento[]) => {
    enviar({ tipo: 'actualizar', id: idActual.current, elementos });
  }, []);

  const detener = useCallback(() => {
    idActual.current++;
    enviar({ tipo: 'detener' });
    setCorriendo(false);
  }, []);

  return { lecturas, corriendo, error, historial, version, iniciar, actualizar, detener };
}
