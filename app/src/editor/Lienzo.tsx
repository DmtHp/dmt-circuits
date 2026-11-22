/**
 * El lienzo: dibuja piezas y cables sobre una rejilla y maneja el mouse.
 *
 * - Arrastrar una pieza la mueve (siempre a puntos de la rejilla).
 * - Arrastrar el fondo desplaza la vista; la rueda del mouse hace zoom.
 * - Hacer clic en un pin empieza un cable: cada clic agrega una esquina, y
 *   termina al hacer clic en otro pin, en un cable, o con doble clic. Esc cancela.
 * - Con una pieza elegida en la paleta, un clic la coloca.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as EventoMouse, type WheelEvent as EventoRueda } from 'react';
import type { Componente } from '../../../components/src';
import type { Cable, Documento, Pieza, Punto } from '../modelo/documento';
import { cajaEnLienzo, huellaDe, pinesEnLienzo, type Huella } from '../modelo/geometria';
import { DibujoPieza, G, type Vista } from './dibujos';

export interface Etiqueta {
  texto: string;
  /** Segunda línea opcional (por ejemplo una lectura). */
  lectura?: string;
}

interface Props {
  doc: Documento;
  biblioteca: ReadonlyMap<string, Componente>;
  vista: Vista;
  seleccion: string | null;
  /** Pieza que se está por colocar (fantasma que sigue al mouse). */
  colocando: Pieza | null;
  /** Corriente del elemento principal de cada pieza (brillo de LED). */
  corrientes: ReadonlyMap<string, number>;
  /** Texto bajo el nombre de cada pieza (valor o lectura). */
  etiquetas: ReadonlyMap<string, Etiqueta>;
  /** Piezas con un aviso o un error. */
  marcadas: ReadonlyMap<string, 'peligro' | 'atencion'>;
  onSeleccionar(id: string | null): void;
  onColocar(punto: Punto): void;
  /** Cambio que se guarda en el historial (deshacer). */
  onConfirmar(doc: Documento): void;
  /** Cambio en vivo durante un arrastre (no se guarda hasta soltar). */
  onCambiarEnVivo(doc: Documento): void;
  onCables(tramos: { a: Punto; b: Punto }[]): void;
  onClicPieza(id: string): void;
  onMoverMouse?(punto: Punto | null, pieza: string | null): void;
  /** Cada vez que cambia, la vista se ajusta para mostrar todo el circuito. */
  encuadre: number;
}

type Arrastre =
  | { tipo: 'pieza'; id: string; inicio: Punto; original: Punto; docInicial: Documento; movio: boolean }
  | { tipo: 'fondo'; inicioPantalla: Punto; vistaInicial: { x: number; y: number } };

/** Ruta en L: primero horizontal y después vertical. */
function rutaL(a: Punto, b: Punto): Punto[] {
  if (a.x === b.x || a.y === b.y) return [b];
  return [{ x: b.x, y: a.y }, b];
}

export function Lienzo(props: Props) {
  const { doc, biblioteca, vista, seleccion, colocando, corrientes, etiquetas, marcadas } = props;
  const svg = useRef<SVGSVGElement | null>(null);
  const [desplazamiento, setDesplazamiento] = useState({ x: -40, y: -60 });
  const [zoom, setZoom] = useState(1);
  const [cursor, setCursor] = useState<Punto | null>(null);
  const [cable, setCable] = useState<Punto[] | null>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const docParaEncuadre = useRef(doc);
  useEffect(() => {
    docParaEncuadre.current = doc;
  });

  // Ajustar la vista al circuito (al abrir un ejemplo o un archivo).
  useEffect(() => {
    const d = docParaEncuadre.current;
    const elemento = svg.current;
    if (!elemento || (d.piezas.length === 0 && d.cables.length === 0)) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const incluir = (x: number, y: number): void => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    for (const p of d.piezas) {
      const caja = cajaEnLienzo(p, huellaDe(p, p.componenteId ? biblioteca.get(p.componenteId) : undefined));
      incluir(caja.x0, caja.y0);
      incluir(caja.x1 + 3, caja.y1);
    }
    for (const c of d.cables) {
      incluir(c.a.x, c.a.y);
      incluir(c.b.x, c.b.y);
    }
    const { width, height } = elemento.getBoundingClientRect();
    const margen = 2;
    const ancho = (x1 - x0 + 2 * margen) * G;
    const alto = (y1 - y0 + 2 * margen) * G;
    const nuevoZoom = Math.min(2, Math.max(0.3, Math.min(width / ancho, height / alto)));
    setZoom(nuevoZoom);
    setDesplazamiento({
      x: (x0 - margen) * G - (width / nuevoZoom - ancho) / 2,
      y: (y0 - margen) * G - (height / nuevoZoom - alto) / 2,
    });
  }, [props.encuadre, biblioteca]);

  const huellas = useMemo(() => {
    const mapa = new Map<string, Huella>();
    for (const p of doc.piezas) mapa.set(p.id, huellaDe(p, p.componenteId ? biblioteca.get(p.componenteId) : undefined));
    return mapa;
  }, [doc.piezas, biblioteca]);

  /** Puntos de la rejilla donde hay un pin (para terminar cables y resaltar). */
  const pinesPorPunto = useMemo(() => {
    const mapa = new Map<string, { pieza: string; pin: string }>();
    for (const p of doc.piezas) {
      for (const pin of pinesEnLienzo(p, huellas.get(p.id)!)) mapa.set(`${pin.X},${pin.Y}`, { pieza: p.id, pin: pin.nombre });
    }
    return mapa;
  }, [doc.piezas, huellas]);

  const puntosDeCable = useMemo(() => {
    const conjunto = new Set<string>();
    for (const c of doc.cables) {
      conjunto.add(`${c.a.x},${c.a.y}`);
      conjunto.add(`${c.b.x},${c.b.y}`);
    }
    return conjunto;
  }, [doc.cables]);

  /** Coordenadas del mouse en unidades de rejilla (sin redondear). */
  const aRejilla = useCallback(
    (evento: { clientX: number; clientY: number }): Punto => {
      const caja = svg.current!.getBoundingClientRect();
      return {
        x: (evento.clientX - caja.left) / zoom / G + desplazamiento.x / G,
        y: (evento.clientY - caja.top) / zoom / G + desplazamiento.y / G,
      };
    },
    [zoom, desplazamiento],
  );
  const redondear = (p: Punto): Punto => ({ x: Math.round(p.x), y: Math.round(p.y) });

  const terminaCable = (p: Punto): boolean => {
    const k = `${p.x},${p.y}`;
    return pinesPorPunto.has(k) || puntosDeCable.has(k) || doc.cables.some((c) => sobreTramo(p, c));
  };

  const confirmarCable = (puntos: Punto[]): void => {
    const tramos: { a: Punto; b: Punto }[] = [];
    for (let i = 1; i < puntos.length; i++) tramos.push({ a: puntos[i - 1]!, b: puntos[i]! });
    if (tramos.length > 0) props.onCables(tramos);
    setCable(null);
  };

  const alBajar = (evento: EventoMouse<SVGSVGElement>): void => {
    if (evento.button !== 0) return;
    const punto = redondear(aRejilla(evento));
    const objetivo = (evento.target as Element).closest('[data-pin],[data-pieza],[data-cable]');

    if (colocando) {
      props.onColocar(punto);
      return;
    }
    if (cable) {
      const ultimo = cable[cable.length - 1]!;
      const nuevos = [...cable, ...rutaL(ultimo, punto)];
      if (terminaCable(punto) && !(punto.x === cable[0]!.x && punto.y === cable[0]!.y)) confirmarCable(nuevos);
      else setCable(nuevos);
      return;
    }
    if (objetivo?.hasAttribute('data-pin')) {
      setCable([punto]);
      return;
    }
    if (objetivo?.hasAttribute('data-pieza')) {
      const id = objetivo.getAttribute('data-pieza')!;
      const pieza = doc.piezas.find((p) => p.id === id)!;
      props.onSeleccionar(id);
      arrastre.current = { tipo: 'pieza', id, inicio: punto, original: { x: pieza.x, y: pieza.y }, docInicial: doc, movio: false };
      return;
    }
    if (objetivo?.hasAttribute('data-cable')) {
      props.onSeleccionar(objetivo.getAttribute('data-cable'));
      return;
    }
    props.onSeleccionar(null);
    arrastre.current = { tipo: 'fondo', inicioPantalla: { x: evento.clientX, y: evento.clientY }, vistaInicial: desplazamiento };
  };

  const alMover = (evento: EventoMouse<SVGSVGElement>): void => {
    const exacto = aRejilla(evento);
    const punto = redondear(exacto);
    if (!cursor || cursor.x !== punto.x || cursor.y !== punto.y) setCursor(punto);
    const a = arrastre.current;
    if (a?.tipo === 'pieza') {
      const dx = punto.x - a.inicio.x;
      const dy = punto.y - a.inicio.y;
      if (dx !== 0 || dy !== 0 || a.movio) {
        a.movio = true;
        props.onCambiarEnVivo({
          ...a.docInicial,
          piezas: a.docInicial.piezas.map((p) => (p.id === a.id ? { ...p, x: a.original.x + dx, y: a.original.y + dy } : p)),
        });
      }
    } else if (a?.tipo === 'fondo') {
      setDesplazamiento({
        x: a.vistaInicial.x - (evento.clientX - a.inicioPantalla.x) / zoom,
        y: a.vistaInicial.y - (evento.clientY - a.inicioPantalla.y) / zoom,
      });
    }
    const sobre = (evento.target as Element).closest('[data-pieza]')?.getAttribute('data-pieza') ?? null;
    props.onMoverMouse?.(punto, sobre);
  };

  const alSoltar = (evento: EventoMouse<SVGSVGElement>): void => {
    const a = arrastre.current;
    arrastre.current = null;
    if (a?.tipo === 'pieza') {
      if (a.movio) props.onConfirmar(doc);
      else if (evento.detail === 1) props.onClicPieza(a.id);
    }
  };

  const alDobleClic = (): void => {
    if (cable && cable.length > 1) confirmarCable(cable);
  };

  const alRueda = (evento: EventoRueda<SVGSVGElement>): void => {
    const antes = aRejilla(evento);
    const nuevoZoom = Math.min(4, Math.max(0.3, zoom * (evento.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const caja = svg.current!.getBoundingClientRect();
    // Mantener fijo el punto bajo el mouse.
    setZoom(nuevoZoom);
    setDesplazamiento({
      x: antes.x * G - (evento.clientX - caja.left) / nuevoZoom,
      y: antes.y * G - (evento.clientY - caja.top) / nuevoZoom,
    });
  };

  const alTecla = (evento: React.KeyboardEvent): void => {
    if (evento.key === 'Escape') setCable(null);
  };

  // Cable en curso con su tramo de vista previa hasta el cursor.
  const previa = cable && cursor ? [...cable, ...rutaL(cable[cable.length - 1]!, cursor)] : null;

  return (
    <svg
      ref={svg}
      className={`lienzo vista-${vista}${colocando ? ' colocando' : ''}${cable ? ' cableando' : ''}`}
      tabIndex={0}
      onMouseDown={alBajar}
      onMouseMove={alMover}
      onMouseUp={alSoltar}
      onMouseLeave={() => {
        arrastre.current = null;
        setCursor(null);
        props.onMoverMouse?.(null, null);
      }}
      onDoubleClick={alDobleClic}
      onWheel={alRueda}
      onKeyDown={alTecla}
      onContextMenu={(e) => {
        e.preventDefault();
        if (cable) confirmarCable(cable);
      }}
    >
      <defs>
        <pattern id="rejilla" width={G} height={G} patternUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={1} className="punto-rejilla" />
        </pattern>
      </defs>
      <g transform={`scale(${zoom}) translate(${-desplazamiento.x} ${-desplazamiento.y})`}>
        <rect x={desplazamiento.x - 2000} y={desplazamiento.y - 2000} width={8000} height={8000} fill="url(#rejilla)" />

        {doc.cables.map((c) => (
          <g key={c.id} data-cable={c.id} className={`cable${seleccion === c.id ? ' seleccionado' : ''}`}>
            <line x1={c.a.x * G} y1={c.a.y * G} x2={c.b.x * G} y2={c.b.y * G} className="cable-toque" />
            <line x1={c.a.x * G} y1={c.a.y * G} x2={c.b.x * G} y2={c.b.y * G} className="cable-linea" />
          </g>
        ))}
        {[...uniones(doc.cables, pinesPorPunto)].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return <circle key={k} cx={x! * G} cy={y! * G} r={3} className="union" />;
        })}

        {doc.piezas.map((p) => (
          <PiezaEnLienzo
            key={p.id}
            pieza={p}
            huella={huellas.get(p.id)!}
            componente={p.componenteId ? biblioteca.get(p.componenteId) : undefined}
            vista={vista}
            seleccionada={seleccion === p.id}
            marca={marcadas.get(p.id)}
            corriente={corrientes.get(p.id)}
            etiqueta={etiquetas.get(p.id)}
          />
        ))}

        {colocando && cursor && (
          <g className="fantasma">
            <PiezaEnLienzo
              pieza={{ ...colocando, x: cursor.x, y: cursor.y }}
              huella={huellaDe(colocando, colocando.componenteId ? biblioteca.get(colocando.componenteId) : undefined)}
              componente={colocando.componenteId ? biblioteca.get(colocando.componenteId) : undefined}
              vista={vista}
              seleccionada={false}
            />
          </g>
        )}

        {previa && <polyline points={previa.map((p) => `${p.x * G},${p.y * G}`).join(' ')} className="cable-previa" />}
        {cursor && !colocando && <circle cx={cursor.x * G} cy={cursor.y * G} r={4} className={`cursor-rejilla${pinesPorPunto.has(`${cursor.x},${cursor.y}`) ? ' sobre-pin' : ''}`} />}
      </g>
    </svg>
  );
}

function sobreTramo(p: Punto, c: Cable): boolean {
  const cruz = (c.b.x - c.a.x) * (p.y - c.a.y) - (c.b.y - c.a.y) * (p.x - c.a.x);
  if (cruz !== 0) return false;
  const punto = (p.x - c.a.x) * (c.b.x - c.a.x) + (p.y - c.a.y) * (c.b.y - c.a.y);
  const largo = (c.b.x - c.a.x) ** 2 + (c.b.y - c.a.y) ** 2;
  return punto >= 0 && punto <= largo;
}

/** Puntos donde se juntan 3 o más cosas (se dibuja un punto de unión, como en los esquemas). */
function uniones(cables: Cable[], pines: Map<string, unknown>): Set<string> {
  const cuenta = new Map<string, number>();
  const sumar = (k: string): void => {
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  };
  for (const c of cables) {
    sumar(`${c.a.x},${c.a.y}`);
    sumar(`${c.b.x},${c.b.y}`);
  }
  for (const c of cables) {
    for (const otro of cables) {
      if (otro === c) continue;
      for (const extremo of [otro.a, otro.b]) {
        const k = `${extremo.x},${extremo.y}`;
        const esExtremo = (c.a.x === extremo.x && c.a.y === extremo.y) || (c.b.x === extremo.x && c.b.y === extremo.y);
        if (!esExtremo && sobreTramo(extremo, c)) sumar(k);
      }
    }
  }
  for (const k of pines.keys()) if (cuenta.has(k)) sumar(k);
  return new Set([...cuenta].filter(([, n]) => n >= 3).map(([k]) => k));
}

interface PropsPieza {
  pieza: Pieza;
  huella: Huella;
  componente: Componente | undefined;
  vista: Vista;
  seleccionada: boolean;
  marca?: 'peligro' | 'atencion' | undefined;
  corriente?: number | undefined;
  etiqueta?: Etiqueta | undefined;
}

function PiezaEnLienzo({ pieza, huella, componente, vista, seleccionada, marca, corriente, etiqueta }: PropsPieza) {
  const caja = cajaEnLienzo(pieza, huella);
  const pines = pinesEnLienzo(pieza, huella);
  return (
    <g className={`pieza${seleccionada ? ' seleccionada' : ''}${marca ? ` marca-${marca}` : ''}`}>
      <rect
        data-pieza={pieza.id}
        x={(caja.x0 - 0.3) * G}
        y={(caja.y0 - 0.3) * G}
        width={(caja.x1 - caja.x0 + 0.6) * G}
        height={(caja.y1 - caja.y0 + 0.6) * G}
        className="caja-pieza"
      />
      <g transform={`translate(${pieza.x * G} ${pieza.y * G}) rotate(${pieza.rotacion * 90})`} pointerEvents="none">
        <DibujoPieza pieza={pieza} huella={huella} componente={componente} vista={vista} {...(corriente !== undefined ? { corriente } : {})} />
      </g>
      {pines.map((p) => (
        <circle key={p.nombre} data-pin={`${pieza.id}:${p.nombre}`} cx={p.X * G} cy={p.Y * G} r={7} className="pin" />
      ))}
      {etiqueta && (
        <text x={(caja.x1 + 0.3) * G} y={(caja.y0 + 0.4) * G} className="etiqueta" pointerEvents="none">
          <tspan>{etiqueta.texto}</tspan>
          {etiqueta.lectura && (
            <tspan x={(caja.x1 + 0.3) * G} dy="1.2em" className="lectura">
              {etiqueta.lectura}
            </tspan>
          )}
        </text>
      )}
    </g>
  );
}
