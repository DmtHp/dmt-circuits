/**
 * El motor corriendo en un Web Worker: un hilo aparte, para que la pantalla
 * nunca se congele mientras se calcula.
 *
 * Bucle de tiempo real: cada ~16 ms (un cuadro de pantalla) se calcula
 * cuánto tiempo simulado corresponde al tiempo real que pasó (por la
 * velocidad elegida) y se avanza hasta ahí, con un presupuesto de cómputo
 * de 12 ms. Si la computadora no alcanza, la simulación va más lenta que lo
 * pedido y se avisa, en vez de trabarse.
 */

import { ErrorCircuito, SesionTransitorio, type Elemento } from '../../../engine/src';
import type { MensajeAlWorker, MensajeDelWorker } from './protocolo';

const contexto = self as unknown as {
  postMessage(mensaje: MensajeDelWorker): void;
  onmessage: ((evento: MessageEvent<MensajeAlWorker>) => void) | null;
};

const CUADRO_MS = 16;
const PRESUPUESTO_MS = 12;
/** Máximo de puntos por nodo en cada mensaje (se toman espaciados si hay más). */
const PUNTOS_POR_MENSAJE = 400;

let sesion: SesionTransitorio | null = null;
let id = 0;
let velocidad = 1;
let nodosSonda: string[] = [];
let baseReal = 0;
let baseSimulada = 0;
let temporizador: ReturnType<typeof setTimeout> | null = null;
let pasosAntes = 0;

function enviar(mensaje: MensajeDelWorker): void {
  contexto.postMessage(mensaje);
}

function enviarError(error: unknown): void {
  detener();
  if (error instanceof ErrorCircuito) {
    enviar({ tipo: 'error', id, mensaje: error.message, nodos: [...error.nodos], elementos: [...error.elementos] });
  } else {
    enviar({ tipo: 'error', id, mensaje: error instanceof Error ? error.message : String(error), nodos: [], elementos: [] });
  }
}

function detener(): void {
  if (temporizador !== null) clearTimeout(temporizador);
  temporizador = null;
  sesion = null;
}

/** Paso máximo según la velocidad: unos 4 pasos por cuadro como mínimo, para que las curvas se vean suaves. */
function pasoMaximoPara(v: number): number {
  return Math.max((v * CUADRO_MS) / 1000 / 4, 1e-12);
}

function iniciar(elementos: Elemento[]): void {
  detener();
  try {
    sesion = new SesionTransitorio({ elementos }, { pasoMaximo_s: pasoMaximoPara(velocidad) });
  } catch (error) {
    enviarError(error);
    return;
  }
  baseReal = performance.now();
  baseSimulada = 0;
  pasosAntes = 0;
  ciclo();
}

function ciclo(): void {
  if (!sesion) return;
  const ahora = performance.now();
  const objetivo = baseSimulada + (velocidad * (ahora - baseReal)) / 1000;
  let parte;
  try {
    parte = sesion.avanzar(objetivo, PRESUPUESTO_MS);
  } catch (error) {
    enviarError(error);
    return;
  }
  // Si quedó muy atrás, se "perdona" la deuda para no acumular retraso infinito.
  const atraso = objetivo - sesion.tiempo_s;
  const atrasado = atraso > (velocidad * 3 * CUADRO_MS) / 1000;
  if (atraso > (velocidad * 250) / 1000) {
    baseReal = ahora;
    baseSimulada = sesion.tiempo_s;
  }

  const tiempos = parte.tiempos;
  const salto = Math.max(1, Math.ceil(tiempos.length / PUNTOS_POR_MENSAJE));
  const indices: number[] = [];
  for (let k = 0; k < tiempos.length; k += salto) indices.push(k);
  if (tiempos.length > 0 && indices.at(-1) !== tiempos.length - 1) indices.push(tiempos.length - 1);
  const serie = {
    tiempos: indices.map((k) => tiempos[k]!),
    nodos: Object.fromEntries(nodosSonda.map((n) => [n, indices.map((k) => parte.voltajes.get(n)?.[k] ?? 0)])),
  };

  if (tiempos.length > 0) {
    const ultimo = tiempos.length - 1;
    const pasos = parte.estadisticas.pasosAceptados;
    enviar({
      tipo: 'lecturas',
      id,
      tiempo_s: sesion.tiempo_s,
      voltajes: [...parte.voltajes].map(([n, serieNodo]) => [n, serieNodo[ultimo]!]),
      elementos: [...parte.elementos].map(([nombre, s]) => [
        nombre,
        { voltaje_v: s.voltaje_v[ultimo]!, corriente_a: s.corriente_a[ultimo]!, potencia_w: s.potencia_w[ultimo]! },
      ]),
      serie,
      atrasado,
      pasosPorSegundo: ((pasos - pasosAntes) * 1000) / Math.max(1, performance.now() - ahora + CUADRO_MS),
    });
    pasosAntes = pasos;
  }
  const usado = performance.now() - ahora;
  temporizador = setTimeout(ciclo, Math.max(0, CUADRO_MS - usado));
}

contexto.onmessage = (evento) => {
  const m = evento.data;
  switch (m.tipo) {
    case 'iniciar':
      id = m.id;
      velocidad = m.velocidad;
      nodosSonda = m.nodosSonda;
      iniciar(m.elementos);
      return;
    case 'actualizar':
      if (!sesion) return;
      try {
        sesion.actualizarValores({ elementos: m.elementos });
        id = m.id;
      } catch {
        // Cambió la forma del circuito: se empieza de nuevo.
        id = m.id;
        iniciar(m.elementos);
      }
      return;
    case 'velocidad':
      // El paso máximo depende de la velocidad: se mantiene el tiempo y se reajusta la base.
      velocidad = m.velocidad;
      if (sesion) {
        baseReal = performance.now();
        baseSimulada = sesion.tiempo_s;
      }
      return;
    case 'detener':
      detener();
      return;
  }
};
