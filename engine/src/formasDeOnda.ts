/**
 * Formas de onda de las fuentes de señal: seno y pulso.
 *
 * Además del valor en cada instante, cada forma dice dónde están sus
 * "quiebres": los instantes en que la señal cambia de golpe de pendiente
 * (por ejemplo, el inicio y el fin de la subida de un pulso). El análisis
 * transitorio hace que un paso de tiempo caiga justo en cada quiebre, para no
 * "saltarse" un borde ni redondearlo.
 */

import type { FormaDeOnda } from './circuito';

/** Valor de la forma de onda en el tiempo t. */
export function evaluarForma(forma: FormaDeOnda, t: number): number {
  if (forma.tipo === 'seno') {
    const retardo = forma.retardo_s ?? 0;
    const fase = ((forma.fase_grados ?? 0) * Math.PI) / 180;
    if (t < retardo) return forma.desplazamiento + forma.amplitud * Math.sin(fase);
    const tt = t - retardo;
    const envolvente = Math.exp(-(forma.amortiguamiento_1_s ?? 0) * tt);
    return forma.desplazamiento + forma.amplitud * envolvente * Math.sin(2 * Math.PI * forma.frecuencia_hz * tt + fase);
  }

  const { inicial, pulsado, retardo_s, subida_s, bajada_s, ancho_s, periodo_s } = forma;
  if (t < retardo_s) return inicial;
  const local = (t - retardo_s) % periodo_s;
  if (local < subida_s) return inicial + ((pulsado - inicial) * local) / subida_s;
  if (local < subida_s + ancho_s) return pulsado;
  if (local < subida_s + ancho_s + bajada_s) return pulsado + ((inicial - pulsado) * (local - subida_s - ancho_s)) / bajada_s;
  return inicial;
}

/** Primer quiebre estrictamente después de t (Infinity si no hay más). */
export function siguienteQuiebre(forma: FormaDeOnda, t: number): number {
  if (forma.tipo === 'seno') {
    const retardo = forma.retardo_s ?? 0;
    return retardo > t ? retardo : Number.POSITIVE_INFINITY;
  }
  const { retardo_s, subida_s, bajada_s, ancho_s, periodo_s } = forma;
  if (t < retardo_s) return retardo_s;
  const ciclo = Math.floor((t - retardo_s) / periodo_s);
  const margen = periodo_s * 1e-9;
  for (let k = ciclo; k <= ciclo + 1; k++) {
    const base = retardo_s + k * periodo_s;
    for (const desfase of [0, subida_s, subida_s + ancho_s, subida_s + ancho_s + bajada_s]) {
      if (base + desfase > t + margen) return base + desfase;
    }
  }
  return retardo_s + (ciclo + 2) * periodo_s;
}

/** Un paso máximo razonable para dibujar bien la forma (20 puntos por ciclo del seno). */
export function pasoSugerido(forma: FormaDeOnda): number {
  return forma.tipo === 'seno' ? 1 / (20 * forma.frecuencia_hz) : Number.POSITIVE_INFINITY;
}

export function validarForma(forma: FormaDeOnda): string[] {
  const problemas: string[] = [];
  const finito = (valor: number | undefined, campo: string): void => {
    if (valor !== undefined && !Number.isFinite(valor)) problemas.push(`${campo} debe ser un número finito (recibí ${valor}).`);
  };
  const positivo = (valor: number, campo: string): void => {
    if (!(Number.isFinite(valor) && valor > 0)) problemas.push(`${campo} debe ser mayor que 0 (recibí ${valor}).`);
  };
  const noNegativo = (valor: number | undefined, campo: string): void => {
    if (valor !== undefined && !(Number.isFinite(valor) && valor >= 0)) {
      problemas.push(`${campo} no puede ser negativo (recibí ${valor}).`);
    }
  };

  if (forma.tipo === 'seno') {
    finito(forma.desplazamiento, 'El desplazamiento del seno');
    finito(forma.amplitud, 'La amplitud del seno');
    positivo(forma.frecuencia_hz, 'La frecuencia del seno');
    noNegativo(forma.retardo_s, 'El retardo del seno');
    finito(forma.amortiguamiento_1_s, 'El amortiguamiento del seno');
    finito(forma.fase_grados, 'La fase del seno');
    return problemas;
  }
  if (forma.tipo === 'pulso') {
    finito(forma.inicial, 'El valor inicial del pulso');
    finito(forma.pulsado, 'El valor pulsado');
    noNegativo(forma.retardo_s, 'El retardo del pulso');
    positivo(forma.subida_s, 'El tiempo de subida (usa algo pequeño, como 1n, para un borde casi vertical)');
    positivo(forma.bajada_s, 'El tiempo de bajada (usa algo pequeño, como 1n, para un borde casi vertical)');
    noNegativo(forma.ancho_s, 'El ancho del pulso');
    positivo(forma.periodo_s, 'El período del pulso');
    if (problemas.length === 0 && forma.subida_s + forma.ancho_s + forma.bajada_s > forma.periodo_s) {
      problemas.push('Subida + ancho + bajada no caben en el período del pulso.');
    }
    return problemas;
  }
  return ['Forma de onda desconocida.'];
}

/**
 * Valor de una fuente en el instante del contexto: la forma de onda si la
 * hay y el análisis la usa (transitorio), o el valor DC si no.
 */
export function valorFuente(
  valorDC: number,
  forma: FormaDeOnda | undefined,
  ctx: { usarFormas: boolean; tiempo_s: number; factorFuentes: number },
): number {
  const valor = forma && ctx.usarFormas ? evaluarForma(forma, ctx.tiempo_s) : valorDC;
  return valor * ctx.factorFuentes;
}
