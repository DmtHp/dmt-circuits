/**
 * Mensajes entre la interfaz y el worker del simulador.
 * Solo viajan datos simples (copiables), nunca funciones.
 */

import type { Elemento } from '../../../engine/src';

export type MensajeAlWorker =
  | {
      tipo: 'iniciar';
      /** Número de simulación: las respuestas de simulaciones viejas se ignoran. */
      id: number;
      elementos: Elemento[];
      /** Segundos simulados por segundo real (1 = tiempo real). */
      velocidad: number;
      /** Nodos cuyo historial se manda completo (sondas del osciloscopio). */
      nodosSonda: string[];
    }
  | { tipo: 'actualizar'; id: number; elementos: Elemento[] }
  | { tipo: 'velocidad'; velocidad: number }
  | { tipo: 'detener' };

export interface MedidaPlana {
  voltaje_v: number;
  corriente_a: number;
  potencia_w: number;
}

export type MensajeDelWorker =
  | {
      tipo: 'lecturas';
      id: number;
      tiempo_s: number;
      /** Último voltaje de cada nodo. */
      voltajes: [string, number][];
      /** Última medida de cada elemento. */
      elementos: [string, MedidaPlana][];
      /** Puntos nuevos de los nodos de las sondas. */
      serie: { tiempos: number[]; nodos: Record<string, number[]> };
      /** true si la computadora no alcanza a simular a la velocidad pedida. */
      atrasado: boolean;
      /** Pasos por segundo real (para mostrar el rendimiento). */
      pasosPorSegundo: number;
    }
  | { tipo: 'error'; id: number; mensaje: string; nodos: string[]; elementos: string[] };
