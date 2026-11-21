/**
 * Lector de netlists de texto, al estilo SPICE, para escribir circuitos sin interfaz.
 *
 * Una línea por elemento. La primera letra del nombre dice qué es:
 *
 *   R<nombre> a b valor              resistencia (Ω)
 *   C<nombre> a b valor              condensador (F); en DC es un abierto
 *   L<nombre> a b valor              bobina (H); en DC es un corto
 *   V<nombre> + − [DC] valor         fuente de voltaje (V)
 *   I<nombre> desde hacia [DC] valor fuente de corriente (A), circula de `desde` a `hacia` por dentro
 *   E<nombre> + − c+ c− ganancia     fuente de voltaje controlada por voltaje (VCVS)
 *   G<nombre> desde hacia c+ c− gm   fuente de corriente controlada por voltaje (VCCS, en S)
 *   D<nombre> ánodo cátodo [IS=…] [N=…] [BV=…] [IBV=…]
 *                                    diodo (BV: voltaje de ruptura, para zener)
 *   A<nombre> + − c+ c− MIN=… MAX=… [GANANCIA=…] [SUAVIDAD=…]
 *                                    limitador suave (ganancia 1 si no se indica)
 *
 * - El nodo "0" (o "gnd") es tierra.
 * - Líneas que empiezan con "*" son comentarios; lo que sigue a ";" en una línea también.
 * - ".end" termina la netlist. Otras directivas con punto todavía no se aceptan.
 * - A diferencia de SPICE, la primera línea NO es un título: también es un elemento.
 *
 * Valores: un número con un sufijo opcional, igual que en SPICE:
 *   f=1e-15  p=1e-12  n=1e-9  u (o µ)=1e-6  m=1e-3  k=1e3  meg=1e6  g=1e9  t=1e12
 * Ojo: "m" es mili y "meg" es mega, sin importar mayúsculas (2.2M = 2.2 mΩ).
 * No se aceptan unidades pegadas ("10uF", "1kohm"), para que no haya confusiones
 * como la de SPICE, donde "1F" significa 1 femtofaradio.
 */

import type { Circuito, Diodo, Elemento, Limitador } from './circuito';
import { ErrorCircuito } from './errores';

const SUFIJOS: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  'µ': 1e-6,
  m: 1e-3,
  k: 1e3,
  meg: 1e6,
  g: 1e9,
  t: 1e12,
};

const PATRON_VALOR = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|[fpnuµmkgt])?$/i;

/** Convierte "4.7k" en 4700. Devuelve null si el texto no es un valor válido. */
export function leerValor(texto: string): number | null {
  const coincidencia = PATRON_VALOR.exec(texto.trim());
  if (!coincidencia) return null;
  const numero = Number(coincidencia[1]);
  const sufijo = coincidencia[2]?.toLowerCase();
  const valor = sufijo ? numero * SUFIJOS[sufijo]! : numero;
  return Number.isFinite(valor) ? valor : null;
}

export function leerNetlist(texto: string): Circuito {
  const elementos: Elemento[] = [];
  const lineas = texto.split(/\r?\n/);

  for (let i = 0; i < lineas.length; i++) {
    const numeroLinea = i + 1;
    const linea = lineas[i]!.split(';')[0]!.trim();
    if (linea === '' || linea.startsWith('*')) continue;

    const fallar = (mensaje: string): never => {
      throw new ErrorCircuito('netlist', `Línea ${numeroLinea} ("${lineas[i]!.trim()}"): ${mensaje}`, { linea: numeroLinea });
    };

    if (linea.startsWith('.')) {
      if (linea.toLowerCase() === '.end') break;
      fallar('las directivas con punto (como .op o .tran) todavía no están soportadas.');
    }

    const partes = linea.split(/\s+/);
    const nombre = partes[0]!;
    const letra = nombre[0]!.toUpperCase();

    const valor = (indice: number, que: string): number => {
      const crudo = partes[indice];
      if (crudo === undefined) return fallar(`falta ${que}.`);
      const v = leerValor(crudo);
      if (v === null) {
        return fallar(
          `"${crudo}" no es un valor válido para ${que}. Escribe un número con sufijo opcional, por ejemplo 4.7k, 100n o 2meg (sin unidades pegadas).`,
        );
      }
      return v;
    };
    const exigirCampos = (cantidad: number, forma: string): void => {
      if (partes.length !== cantidad) fallar(`se esperaba "${forma}" (${cantidad} campos) y hay ${partes.length}.`);
    };
    /** Quita la palabra opcional "DC" antes del valor de una fuente. */
    const quitarDC = (): void => {
      if (partes.length === 5 && partes[3]!.toLowerCase() === 'dc') partes.splice(3, 1);
    };

    /** Lee parámetros "CLAVE=valor" desde la posición `desde`. */
    const parametros = (desde: number, permitidos: string[], obligatorios: string[] = []): Map<string, number> => {
      const resultado = new Map<string, number>();
      for (const crudo of partes.slice(desde)) {
        const [clave, texto, sobra] = crudo.split('=');
        const nombreClave = clave?.toUpperCase() ?? '';
        if (texto === undefined || sobra !== undefined || !permitidos.includes(nombreClave)) {
          fallar(`no entiendo "${crudo}". Se esperan parámetros CLAVE=valor con CLAVE entre ${permitidos.join(', ')}.`);
        }
        const v = leerValor(texto!);
        if (v === null) fallar(`"${texto}" no es un valor válido para ${nombreClave}.`);
        resultado.set(nombreClave, v!);
      }
      for (const clave of obligatorios) {
        if (!resultado.has(clave)) fallar(`falta el parámetro ${clave}=….`);
      }
      return resultado;
    };
    const exigirMinimo = (cantidad: number, forma: string): void => {
      if (partes.length < cantidad) fallar(`se esperaba "${forma}".`);
    };

    switch (letra) {
      case 'R':
        exigirCampos(4, 'R<nombre> a b valor');
        elementos.push({ tipo: 'resistencia', nombre, a: partes[1]!, b: partes[2]!, resistencia_ohm: valor(3, 'la resistencia') });
        break;
      case 'C':
        exigirCampos(4, 'C<nombre> a b valor');
        elementos.push({ tipo: 'condensador', nombre, a: partes[1]!, b: partes[2]!, capacitancia_f: valor(3, 'la capacitancia') });
        break;
      case 'L':
        exigirCampos(4, 'L<nombre> a b valor');
        elementos.push({ tipo: 'bobina', nombre, a: partes[1]!, b: partes[2]!, inductancia_h: valor(3, 'la inductancia') });
        break;
      case 'V':
        quitarDC();
        exigirCampos(4, 'V<nombre> + − [DC] valor');
        elementos.push({ tipo: 'fuenteVoltaje', nombre, positivo: partes[1]!, negativo: partes[2]!, voltaje_v: valor(3, 'el voltaje') });
        break;
      case 'I':
        quitarDC();
        exigirCampos(4, 'I<nombre> desde hacia [DC] valor');
        elementos.push({ tipo: 'fuenteCorriente', nombre, desde: partes[1]!, hacia: partes[2]!, corriente_a: valor(3, 'la corriente') });
        break;
      case 'E':
        exigirCampos(6, 'E<nombre> + − c+ c− ganancia');
        elementos.push({
          tipo: 'vcvs',
          nombre,
          positivo: partes[1]!,
          negativo: partes[2]!,
          controlPositivo: partes[3]!,
          controlNegativo: partes[4]!,
          ganancia: valor(5, 'la ganancia'),
        });
        break;
      case 'G':
        exigirCampos(6, 'G<nombre> desde hacia c+ c− gm');
        elementos.push({
          tipo: 'vccs',
          nombre,
          desde: partes[1]!,
          hacia: partes[2]!,
          controlPositivo: partes[3]!,
          controlNegativo: partes[4]!,
          transconductancia_s: valor(5, 'la transconductancia'),
        });
        break;
      case 'D': {
        exigirMinimo(3, 'D<nombre> ánodo cátodo [IS=…] [N=…] [BV=…] [IBV=…]');
        const p = parametros(3, ['IS', 'N', 'BV', 'IBV']);
        const diodo: Diodo = { tipo: 'diodo', nombre, anodo: partes[1]!, catodo: partes[2]! };
        if (p.has('IS')) diodo.corrienteSaturacion_a = p.get('IS')!;
        if (p.has('N')) diodo.coeficienteEmision = p.get('N')!;
        if (p.has('BV')) diodo.ruptura_v = p.get('BV')!;
        if (p.has('IBV')) diodo.corrienteRuptura_a = p.get('IBV')!;
        elementos.push(diodo);
        break;
      }
      case 'A': {
        exigirMinimo(7, 'A<nombre> + − c+ c− MIN=… MAX=… [GANANCIA=…] [SUAVIDAD=…]');
        const p = parametros(5, ['MIN', 'MAX', 'GANANCIA', 'SUAVIDAD'], ['MIN', 'MAX']);
        const limitador: Limitador = {
          tipo: 'limitador',
          nombre,
          positivo: partes[1]!,
          negativo: partes[2]!,
          controlPositivo: partes[3]!,
          controlNegativo: partes[4]!,
          ganancia: p.get('GANANCIA') ?? 1,
          minimo_v: p.get('MIN')!,
          maximo_v: p.get('MAX')!,
        };
        if (p.has('SUAVIDAD')) limitador.suavidad_v = p.get('SUAVIDAD')!;
        elementos.push(limitador);
        break;
      }
      default:
        fallar(`no conozco elementos que empiecen con "${nombre[0]}". Usa R, C, L, V, I, E, G, D o A.`);
    }
  }

  return { elementos };
}
