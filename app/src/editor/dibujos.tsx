/**
 * Dibujos de las piezas, generados por la app a partir de la categoría, la
 * plantilla, los pines y el encapsulado del componente (la IA no dibuja nada).
 *
 * Dos vistas:
 * - esquema: símbolos de libro (zigzag, placas, triángulo del diodo…);
 * - físico: el encapsulado real (resistencia con bandas de colores, DO-35,
 *   LED de 5 mm, DIP con muesca y pines numerados…).
 * Los pines quedan en el mismo lugar en las dos vistas.
 *
 * Todo se dibuja en coordenadas locales de la pieza, en unidades de rejilla
 * multiplicadas por G (píxeles por unidad).
 */

import { memo, type ReactNode } from 'react';
import type { Componente } from '../../../components/src';
import type { Pieza } from '../modelo/documento';
import type { Huella } from '../modelo/geometria';

export const G = 20;
export type Vista = 'esquema' | 'fisico';

/** Colores del código de resistencias: negro, marrón, rojo, naranja, amarillo, verde, azul, violeta, gris, blanco. */
const COLORES_BANDAS = ['#1b1b1b', '#7a4a1e', '#d32f2f', '#f57c00', '#fbc02d', '#388e3c', '#1976d2', '#7b1fa2', '#9e9e9e', '#fafafa'];

/** Bandas de una resistencia de 4 bandas: dos cifras, multiplicador y tolerancia (dorado, 5 %). */
export function bandasResistencia(ohm: number): string[] {
  if (!(ohm > 0)) return [COLORES_BANDAS[0]!, COLORES_BANDAS[0]!, COLORES_BANDAS[0]!, '#c9a227'];
  const exponente = Math.floor(Math.log10(ohm)) - 1;
  let cifras = Math.round(ohm / 10 ** exponente);
  let multiplicador = exponente;
  if (cifras >= 100) {
    cifras = Math.round(cifras / 10);
    multiplicador++;
  }
  const d1 = Math.floor(cifras / 10);
  const d2 = cifras % 10;
  const colorMultiplicador = multiplicador >= 0 && multiplicador <= 9 ? COLORES_BANDAS[multiplicador]! : multiplicador === -1 ? '#c9a227' : '#b0b0b0';
  return [COLORES_BANDAS[d1]!, COLORES_BANDAS[d2]!, colorMultiplicador, '#c9a227'];
}

interface PropsDibujo {
  pieza: Pieza;
  huella: Huella;
  componente: Componente | undefined;
  vista: Vista;
  /** Corriente por el elemento principal (para el brillo del LED), si se está simulando. */
  corriente?: number;
}

const linea = (x1: number, y1: number, x2: number, y2: number, clase = 'trazo'): ReactNode => (
  <line x1={x1 * G} y1={y1 * G} x2={x2 * G} y2={y2 * G} className={clase} />
);

function plantillaDe(c: Componente | undefined): string | undefined {
  return c?.modelo.tipo === 'subcircuito' ? c.modelo.bloques?.[0]?.usa : undefined;
}

function esLed(c: Componente | undefined): boolean {
  return !!c && c.encapsulado.toUpperCase().startsWith('LED');
}

function esZener(c: Componente | undefined): boolean {
  return c?.modelo.tipo === 'subcircuito' && c.modelo.bloques?.[0]?.parametros?.bv_v !== undefined;
}

/** Brillo del LED de 0 a 1: proporcional a la corriente, lleno a 20 mA. */
function brillo(corriente: number | undefined): number {
  return corriente === undefined ? 0 : Math.max(0, Math.min(1, corriente / 0.02));
}

// ---------- Esquema ----------

function esquemaDosPines({ componente, pieza, corriente }: PropsDibujo): ReactNode {
  const plantilla = plantillaDe(componente);
  switch (plantilla) {
    case 'resistencia': {
      const puntos = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]
        .map((x, i) => `${x * G},${(i === 0 || i === 8 ? 0 : i % 2 ? -0.4 : 0.4) * G}`)
        .join(' ');
      return (
        <>
          {linea(0, 0, 1, 0)}
          <polyline points={puntos} className="trazo" />
          {linea(3, 0, 4, 0)}
        </>
      );
    }
    case 'condensador':
      return (
        <>
          {linea(0, 0, 1.8, 0)}
          {linea(1.8, -0.8, 1.8, 0.8, 'trazo grueso')}
          {linea(2.2, -0.8, 2.2, 0.8, 'trazo grueso')}
          {linea(2.2, 0, 4, 0)}
        </>
      );
    case 'bobina':
      return (
        <>
          {linea(0, 0, 1, 0)}
          <path d={`M ${G} 0 ${[0, 1, 2, 3].map(() => `a ${0.25 * G} ${0.3 * G} 0 0 1 ${0.5 * G} 0`).join(' ')}`} className="trazo" />
          {linea(3, 0, 4, 0)}
        </>
      );
    case 'interruptor': {
      const cerrado = (pieza.parametros.cerrado ?? 0) >= 0.5;
      return (
        <>
          {linea(0, 0, 1.2, 0)}
          <circle cx={1.2 * G} cy={0} r={0.12 * G} className="trazo relleno-fondo" />
          {cerrado ? linea(1.2, 0, 2.8, 0) : linea(1.2, 0, 2.7, -0.8)}
          <circle cx={2.8 * G} cy={0} r={0.12 * G} className="trazo relleno-fondo" />
          {linea(2.8, 0, 4, 0)}
        </>
      );
    }
    case 'diodo_basico': {
      const led = esLed(componente);
      const b = brillo(corriente);
      return (
        <>
          {led && b > 0 && <circle cx={2 * G} cy={0} r={1.4 * G} className="brillo-led" style={{ opacity: 0.15 + 0.6 * b }} />}
          {linea(0, 0, 1.5, 0)}
          <polygon points={`${1.5 * G},${-0.6 * G} ${1.5 * G},${0.6 * G} ${2.5 * G},0`} className="trazo relleno-fondo" />
          {esZener(componente) ? (
            <polyline points={`${2.3 * G},${-0.8 * G} ${2.5 * G},${-0.6 * G} ${2.5 * G},${0.6 * G} ${2.7 * G},${0.8 * G}`} className="trazo" />
          ) : (
            linea(2.5, -0.6, 2.5, 0.6)
          )}
          {linea(2.5, 0, 4, 0)}
          {led && (
            <>
              <path d={`M ${1.9 * G} ${-0.8 * G} l ${0.4 * G} ${-0.5 * G} m ${-0.2 * G} 0 l ${0.2 * G} 0 l 0 ${0.2 * G}`} className="trazo fino" />
              <path d={`M ${2.3 * G} ${-0.7 * G} l ${0.4 * G} ${-0.5 * G} m ${-0.2 * G} 0 l ${0.2 * G} 0 l 0 ${0.2 * G}`} className="trazo fino" />
            </>
          )}
        </>
      );
    }
    default:
      return (
        <>
          {linea(0, 0, 1, 0)}
          <rect x={G} y={-0.5 * G} width={2 * G} height={G} className="trazo relleno-fondo" />
          {linea(3, 0, 4, 0)}
        </>
      );
  }
}

function esquemaPotenciometro(): ReactNode {
  const puntos = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]
    .map((x, i) => `${x * G},${(i === 0 || i === 8 ? 0 : i % 2 ? -0.4 : 0.4) * G}`)
    .join(' ');
  return (
    <>
      {linea(0, 0, 1, 0)}
      <polyline points={puntos} className="trazo" />
      {linea(3, 0, 4, 0)}
      {linea(2, 2, 2, 0.6)}
      <polygon points={`${2 * G},${0.45 * G} ${1.8 * G},${0.85 * G} ${2.2 * G},${0.85 * G}`} className="relleno-tinta" />
    </>
  );
}

function cuerpoDip({ huella, componente, vista }: PropsDibujo): ReactNode {
  const { x0, y0, x1, y1 } = huella.caja;
  const fisico = vista === 'fisico';
  const mitad = (x0 + x1) / 2;
  return (
    <>
      {huella.pines.map((p) => (
        <g key={p.n}>
          {fisico ? (
            <rect x={(p.x === 0 ? 0 : p.x - 0.6) * G} y={(p.y - 0.18) * G} width={0.6 * G} height={0.36 * G} className="pin-metal" />
          ) : (
            linea(p.x, p.y, p.x === 0 ? x0 : x1, p.y)
          )}
        </g>
      ))}
      <rect x={x0 * G} y={y0 * G} width={(x1 - x0) * G} height={(y1 - y0) * G} rx={fisico ? 3 : 0} className={fisico ? 'cuerpo-ic' : 'trazo relleno-fondo'} />
      {fisico ? (
        <>
          <path d={`M ${(mitad - 0.45) * G} ${y0 * G} a ${0.45 * G} ${0.45 * G} 0 0 0 ${0.9 * G} 0`} className="muesca" />
          <circle cx={(x0 + 0.5) * G} cy={(y0 + 0.6) * G} r={0.15 * G} className="muesca" />
          <text x={mitad * G} y={((y0 + y1) / 2) * G} className="texto-ic" transform={`rotate(90 ${mitad * G} ${((y0 + y1) / 2) * G})`}>
            {componente?.id.toUpperCase()}
          </text>
        </>
      ) : null}
      {huella.pines.map((p) => {
        const izquierda = p.x === 0;
        return (
          <g key={`t${p.n}`}>
            <text x={(izquierda ? x0 - 0.15 : x1 + 0.15) * G} y={(p.y - 0.2) * G} className={`numero-pin ${izquierda ? 'derecha' : 'izquierda'}`}>
              {p.n}
            </text>
            {!fisico && (
              <text x={(izquierda ? x0 + 0.2 : x1 - 0.2) * G} y={(p.y + 0.15) * G} className={`nombre-pin ${izquierda ? 'izquierda' : 'derecha'}`}>
                {p.nombre}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function enLinea({ huella }: PropsDibujo): ReactNode {
  const { x0, y0, x1 } = huella.caja;
  return (
    <>
      <rect x={x0 * G} y={y0 * G} width={(x1 - x0) * G} height={1.2 * G} className="trazo relleno-fondo" />
      {huella.pines.map((p) => (
        <g key={p.n}>
          {linea(p.x, p.y, p.x, y0 + 1.2)}
          <text x={p.x * G} y={(y0 + 0.8) * G} className="nombre-pin centro">
            {p.nombre}
          </text>
        </g>
      ))}
    </>
  );
}

function fuente({ pieza }: PropsDibujo): ReactNode {
  const senal = pieza.tipo === 'fuente_senal';
  const cuadrada = (pieza.parametros.forma ?? 0) === 1;
  return (
    <>
      {linea(0, 0, 0, 0.8)}
      <circle cx={0} cy={2 * G} r={1.2 * G} className="trazo relleno-fondo" />
      {linea(0, 3.2, 0, 4)}
      {senal ? (
        cuadrada ? (
          <polyline points={`${-0.6 * G},${2.3 * G} ${-0.6 * G},${1.7 * G} 0,${1.7 * G} 0,${2.3 * G} ${0.6 * G},${2.3 * G} ${0.6 * G},${1.7 * G}`} className="trazo fino" />
        ) : (
          <path d={`M ${-0.7 * G} ${2 * G} q ${0.35 * G} ${-0.8 * G} ${0.7 * G} 0 t ${0.7 * G} 0`} className="trazo fino" />
        )
      ) : (
        <>
          <text x={0} y={1.55 * G} className="signo">+</text>
          <text x={0} y={2.85 * G} className="signo">−</text>
        </>
      )}
    </>
  );
}

function tierra(): ReactNode {
  return (
    <>
      {linea(0, 0, 0, 0.6)}
      {linea(-0.9, 0.6, 0.9, 0.6)}
      {linea(-0.55, 1, 0.55, 1)}
      {linea(-0.2, 1.4, 0.2, 1.4)}
    </>
  );
}

function instrumento({ pieza }: PropsDibujo): ReactNode {
  return (
    <>
      {linea(0, 0, 0.8, 0)}
      <circle cx={2 * G} cy={0} r={1.2 * G} className="trazo relleno-instrumento" />
      <text x={2 * G} y={0.35 * G} className="letra-instrumento">
        {pieza.tipo === 'voltimetro' ? 'V' : 'A'}
      </text>
      {linea(3.2, 0, 4, 0)}
      <text x={0.3 * G} y={-0.4 * G} className="signo pequeno">+</text>
    </>
  );
}

function sonda({ pieza }: PropsDibujo): ReactNode {
  const canal = pieza.parametros.canal ?? 1;
  return (
    <>
      {linea(0, 0, 0.9, -1.2)}
      <rect x={0.6 * G} y={-2.3 * G} width={1.8 * G} height={1.1 * G} rx={4} className={`sonda canal${canal}`} />
      <text x={1.5 * G} y={-1.5 * G} className="texto-sonda">
        CH{canal}
      </text>
    </>
  );
}

// ---------- Físico ----------

function fisicoDosPines(props: PropsDibujo): ReactNode {
  const { componente, pieza, corriente } = props;
  const plantilla = plantillaDe(componente);
  const patas = (
    <>
      {linea(0, 0, 1.1, 0, 'pata')}
      {linea(2.9, 0, 4, 0, 'pata')}
    </>
  );
  if (plantilla === 'resistencia') {
    const bandas = bandasResistencia(pieza.parametros.resistencia_ohm ?? 0);
    return (
      <>
        {patas}
        <rect x={1 * G} y={-0.42 * G} width={2 * G} height={0.84 * G} rx={0.35 * G} className="cuerpo-resistencia" />
        {bandas.map((color, i) => (
          <rect key={i} x={(1.3 + i * 0.35 + (i === 3 ? 0.25 : 0)) * G} y={-0.42 * G} width={0.16 * G} height={0.84 * G} fill={color} />
        ))}
      </>
    );
  }
  if (plantilla === 'condensador') {
    const electrolitico = (pieza.parametros.capacitancia_f ?? 0) >= 1e-6;
    return electrolitico ? (
      <>
        {patas}
        <rect x={1 * G} y={-0.7 * G} width={2 * G} height={1.4 * G} rx={0.2 * G} className="cuerpo-electrolitico" />
        <rect x={2.55 * G} y={-0.7 * G} width={0.3 * G} height={1.4 * G} className="franja-electrolitico" />
      </>
    ) : (
      <>
        {patas}
        <ellipse cx={2 * G} cy={0} rx={0.9 * G} ry={0.7 * G} className="cuerpo-ceramico" />
      </>
    );
  }
  if (plantilla === 'bobina') {
    return (
      <>
        {patas}
        <rect x={1 * G} y={-0.6 * G} width={2 * G} height={1.2 * G} rx={0.5 * G} className="cuerpo-bobina" />
      </>
    );
  }
  if (plantilla === 'interruptor') {
    const cerrado = (pieza.parametros.cerrado ?? 0) >= 0.5;
    return (
      <>
        {patas}
        <rect x={1 * G} y={-0.9 * G} width={2 * G} height={1.8 * G} rx={3} className="cuerpo-ic" />
        <circle cx={2 * G} cy={0} r={0.55 * G} className={cerrado ? 'boton presionado' : 'boton'} />
      </>
    );
  }
  if (plantilla === 'diodo_basico') {
    if (esLed(componente)) {
      const b = brillo(corriente);
      return (
        <>
          {linea(0, 0, 1.3, 0, 'pata')}
          {linea(2.7, 0, 4, 0, 'pata')}
          {b > 0 && <circle cx={2 * G} cy={0} r={1.6 * G} className="brillo-led" style={{ opacity: 0.2 + 0.7 * b }} />}
          <path d={`M ${2.55 * G} ${-0.75 * G} A ${0.95 * G} ${0.95 * G} 0 1 0 ${2.55 * G} ${0.75 * G} Z`} className="cuerpo-led" style={{ opacity: 0.55 + 0.45 * b }} />
        </>
      );
    }
    const vidrio = componente?.encapsulado.toUpperCase() === 'DO-35';
    return (
      <>
        {patas}
        <rect x={1.1 * G} y={-0.35 * G} width={1.8 * G} height={0.7 * G} rx={0.3 * G} className={vidrio ? 'cuerpo-vidrio' : 'cuerpo-do41'} />
        <rect x={2.45 * G} y={-0.35 * G} width={0.22 * G} height={0.7 * G} className={vidrio ? 'banda-negra' : 'banda-plateada'} />
      </>
    );
  }
  return esquemaDosPines(props);
}

function fisicoPotenciometro(): ReactNode {
  return (
    <>
      {linea(0, 0, 0.8, 0, 'pata')}
      {linea(3.2, 0, 4, 0, 'pata')}
      {linea(2, 2, 2, 1.3, 'pata')}
      <rect x={0.8 * G} y={-1 * G} width={2.4 * G} height={2.3 * G} rx={3} className="cuerpo-trimmer" />
      <circle cx={2 * G} cy={0.15 * G} r={0.75 * G} className="tornillo" />
      {linea(1.5, 0.15, 2.5, 0.15, 'ranura')}
    </>
  );
}

function DibujoPiezaBase(props: PropsDibujo) {
  const { huella, vista, pieza } = props;
  switch (pieza.tipo) {
    case 'fuente_dc':
    case 'fuente_senal':
      return <>{fuente(props)}</>;
    case 'tierra':
      return <>{tierra()}</>;
    case 'voltimetro':
    case 'amperimetro':
      return <>{instrumento(props)}</>;
    case 'sonda':
      return <>{sonda(props)}</>;
    case 'componente':
      break;
  }
  switch (huella.forma) {
    case 'dos_pines':
      return <>{vista === 'fisico' ? fisicoDosPines(props) : esquemaDosPines(props)}</>;
    case 'potenciometro':
      return <>{vista === 'fisico' ? fisicoPotenciometro() : esquemaPotenciometro()}</>;
    case 'dip':
      return <>{cuerpoDip(props)}</>;
    default:
      return <>{enLinea(props)}</>;
  }
}

/** Se vuelve a dibujar solo si cambia la pieza, la vista o el brillo (redibujar solo lo que cambió). */
export const DibujoPieza = memo(DibujoPiezaBase, (a, b) => {
  const brilloA = Math.round(brillo(a.corriente) * 20);
  const brilloB = Math.round(brillo(b.corriente) * 20);
  return a.pieza === b.pieza && a.vista === b.vista && a.componente === b.componente && brilloA === brilloB;
});
