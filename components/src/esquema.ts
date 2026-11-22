/**
 * Validador de estructura propio (filtro 1).
 *
 * Un "esquema" describe qué forma debe tener un dato: qué campos lleva un
 * objeto, de qué tipo es cada uno, qué valores se permiten. El validador
 * recorre el dato y el esquema a la vez y anota cada diferencia con su ruta
 * (por ejemplo "pines[2].nombre") y un mensaje en español.
 *
 * Se escribió aquí en vez de usar una librería para no sumar dependencias y
 * para que los mensajes sean claros para un estudiante (o para una IA que
 * tenga que corregir el archivo).
 */

export interface ErrorValidacion {
  /** Dónde está el problema, por ejemplo "pines[2].nombre". Vacío = el archivo entero. */
  ruta: string;
  mensaje: string;
}

export type Esquema =
  | { tipo: 'texto'; patron?: RegExp; descripcionPatron?: string; largoMaximo?: number }
  | { tipo: 'numero'; entero?: boolean; minimo?: number; maximo?: number }
  | { tipo: 'numeroOExpresion' }
  | { tipo: 'booleano' }
  | { tipo: 'opcion'; valores: readonly string[] }
  | { tipo: 'lista'; de: Esquema; minimo?: number; maximo?: number }
  | { tipo: 'objeto'; campos: Record<string, CampoEsquema>; permitirOtros?: boolean }
  | { tipo: 'mapa'; de: Esquema }
  | { tipo: 'segun'; campo: string; variantes: Record<string, Esquema> }
  | { tipo: 'cualquiera' };

export interface CampoEsquema {
  esquema: Esquema;
  obligatorio?: boolean;
}

export function obligatorio(esquema: Esquema): CampoEsquema {
  return { esquema, obligatorio: true };
}

export function opcional(esquema: Esquema): CampoEsquema {
  return { esquema };
}

/** Nombre del tipo de un valor JSON, en español. */
export function tipoDe(valor: unknown): string {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return 'una lista';
  switch (typeof valor) {
    case 'string':
      return 'un texto';
    case 'number':
      return 'un número';
    case 'boolean':
      return 'verdadero/falso';
    case 'object':
      return 'un objeto';
    default:
      return typeof valor;
  }
}

export function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function unirRuta(ruta: string, campo: string | number): string {
  if (typeof campo === 'number') return `${ruta}[${campo}]`;
  return ruta ? `${ruta}.${campo}` : campo;
}

/** Distancia de edición (Levenshtein): cuántas letras hay que cambiar para pasar de a a b. */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0]!;
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j]!;
      fila[j] = Math.min(fila[j]! + 1, fila[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length]!;
}

/** Sugiere el nombre conocido más parecido, si hay uno cercano (para errores de escritura como "pins" → "pines"). */
export function sugerir(nombre: string, conocidos: readonly string[]): string | undefined {
  let mejor: string | undefined;
  let mejorDistancia = Infinity;
  for (const c of conocidos) {
    const d = distancia(nombre.toLowerCase(), c.toLowerCase());
    if (d < mejorDistancia) {
      mejorDistancia = d;
      mejor = c;
    }
  }
  return mejorDistancia <= Math.max(1, Math.floor(nombre.length / 3)) ? mejor : undefined;
}

export function validarEsquema(valor: unknown, esquema: Esquema, ruta = '', errores: ErrorValidacion[] = []): ErrorValidacion[] {
  const fallo = (mensaje: string): void => {
    errores.push({ ruta, mensaje });
  };

  switch (esquema.tipo) {
    case 'cualquiera':
      return errores;
    case 'texto':
      if (typeof valor !== 'string') {
        fallo(`Debe ser un texto y es ${tipoDe(valor)}.`);
      } else if (valor.trim() === '') {
        fallo('No puede estar vacío.');
      } else if (esquema.largoMaximo !== undefined && valor.length > esquema.largoMaximo) {
        fallo(`Es demasiado largo (máximo ${esquema.largoMaximo} caracteres).`);
      } else if (esquema.patron && !esquema.patron.test(valor)) {
        fallo(`"${valor}" no tiene el formato esperado: ${esquema.descripcionPatron ?? String(esquema.patron)}.`);
      }
      return errores;
    case 'numero':
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        fallo(`Debe ser un número y es ${tipoDe(valor)}${typeof valor === 'string' ? ` ("${valor}"). Escribe el número sin comillas` : ''}.`);
      } else if (esquema.entero && !Number.isInteger(valor)) {
        fallo(`Debe ser un número entero (recibí ${valor}).`);
      } else if (esquema.minimo !== undefined && valor < esquema.minimo) {
        fallo(`Debe ser al menos ${esquema.minimo} (recibí ${valor}).`);
      } else if (esquema.maximo !== undefined && valor > esquema.maximo) {
        fallo(`Debe ser como mucho ${esquema.maximo} (recibí ${valor}).`);
      }
      return errores;
    case 'numeroOExpresion':
      if (!(typeof valor === 'number' && Number.isFinite(valor)) && !(typeof valor === 'string' && valor.trim() !== '')) {
        fallo(`Debe ser un número o una expresión de texto (como "VCC - 1.5") y es ${tipoDe(valor)}.`);
      }
      return errores;
    case 'booleano':
      if (typeof valor !== 'boolean') fallo(`Debe ser true o false y es ${tipoDe(valor)}.`);
      return errores;
    case 'opcion':
      if (typeof valor !== 'string' || !esquema.valores.includes(valor)) {
        const parecido = typeof valor === 'string' ? sugerir(valor, esquema.valores) : undefined;
        fallo(
          `${typeof valor === 'string' ? `"${valor}"` : `El valor (${tipoDe(valor)})`} no es válido. ` +
            `Opciones: ${esquema.valores.join(', ')}.` +
            (parecido ? ` ¿Quisiste decir "${parecido}"?` : ''),
        );
      }
      return errores;
    case 'lista':
      if (!Array.isArray(valor)) {
        fallo(`Debe ser una lista [ … ] y es ${tipoDe(valor)}.`);
        return errores;
      }
      if (esquema.minimo !== undefined && valor.length < esquema.minimo) {
        fallo(`Debe tener al menos ${esquema.minimo} elemento${esquema.minimo === 1 ? '' : 's'} (tiene ${valor.length}).`);
      }
      if (esquema.maximo !== undefined && valor.length > esquema.maximo) {
        fallo(`Puede tener como mucho ${esquema.maximo} elementos (tiene ${valor.length}).`);
      }
      valor.forEach((item, i) => validarEsquema(item, esquema.de, unirRuta(ruta, i), errores));
      return errores;
    case 'mapa':
      if (!esObjeto(valor)) {
        fallo(`Debe ser un objeto { "nombre": valor, … } y es ${tipoDe(valor)}.`);
        return errores;
      }
      for (const [clave, item] of Object.entries(valor)) validarEsquema(item, esquema.de, unirRuta(ruta, clave), errores);
      return errores;
    case 'objeto': {
      if (!esObjeto(valor)) {
        fallo(`Debe ser un objeto { … } y es ${tipoDe(valor)}.`);
        return errores;
      }
      const conocidos = Object.keys(esquema.campos);
      for (const [nombre, campo] of Object.entries(esquema.campos)) {
        if (!(nombre in valor) || valor[nombre] === undefined) {
          if (campo.obligatorio) errores.push({ ruta: unirRuta(ruta, nombre), mensaje: 'Falta este campo, que es obligatorio.' });
          continue;
        }
        validarEsquema(valor[nombre], campo.esquema, unirRuta(ruta, nombre), errores);
      }
      if (!esquema.permitirOtros) {
        for (const nombre of Object.keys(valor)) {
          if (conocidos.includes(nombre)) continue;
          const parecido = sugerir(nombre, conocidos);
          errores.push({
            ruta: unirRuta(ruta, nombre),
            mensaje: `Campo desconocido.` + (parecido ? ` ¿Quisiste decir "${parecido}"?` : ` Los campos válidos aquí son: ${conocidos.join(', ')}.`),
          });
        }
      }
      return errores;
    }
    case 'segun': {
      if (!esObjeto(valor)) {
        fallo(`Debe ser un objeto { … } y es ${tipoDe(valor)}.`);
        return errores;
      }
      const clave = valor[esquema.campo];
      const opciones = Object.keys(esquema.variantes);
      if (typeof clave !== 'string' || !(clave in esquema.variantes)) {
        const parecido = typeof clave === 'string' ? sugerir(clave, opciones) : undefined;
        errores.push({
          ruta: unirRuta(ruta, esquema.campo),
          mensaje:
            clave === undefined
              ? `Falta este campo. Opciones: ${opciones.join(', ')}.`
              : `"${String(clave)}" no es válido. Opciones: ${opciones.join(', ')}.` + (parecido ? ` ¿Quisiste decir "${parecido}"?` : ''),
        });
        return errores;
      }
      return validarEsquema(valor, esquema.variantes[clave]!, ruta, errores);
    }
  }
}
