/**
 * DMT Circuits: editor y simulador.
 *
 * Arma el documento (piezas y cables), lo convierte en circuito para el motor
 * y lo manda al worker. Mientras simula, cada cambio de valor (potenciómetro,
 * interruptor, una resistencia) se envía sin reiniciar; si cambia la forma
 * del circuito (un cable, una pieza nueva), la simulación empieza de nuevo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BIBLIOTECA } from '../../components/src';
import type { Elemento } from '../../engine/src';
import type { Vista } from './editor/dibujos';
import { Lienzo, type Etiqueta } from './editor/Lienzo';
import { Osciloscopio } from './editor/Osciloscopio';
import { Paleta, Propiedades } from './editor/Paneles';
import { calcularAvisos, conPrefijo, type Aviso } from './modelo/avisos';
import { armarCircuito } from './modelo/conectividad';
import {
  agregarCables,
  agregarPieza,
  borrar,
  cambiarParametro,
  DOCUMENTO_VACIO,
  esDocumento,
  nombreLibre,
  nuevoId,
  rotarPieza,
  type Documento,
  type Pieza,
  type Punto,
} from './modelo/documento';
import { EJEMPLOS } from './modelo/ejemplos';
import { armarCatalogo, definicionDe, type DefPieza } from './modelo/piezas';
import { useSimulador } from './sim/useSimulador';

const CLAVE_GUARDADO = 'dmt-circuits:documento';
const VELOCIDADES = [
  { valor: 1, texto: 'Tiempo real' },
  { valor: 0.1, texto: '10 veces más lento' },
  { valor: 0.01, texto: '100 veces más lento' },
  { valor: 1e-3, texto: '1000 veces más lento' },
  { valor: 1e-4, texto: '10 000 veces más lento' },
];

function cargarGuardado(): Documento {
  try {
    const texto = localStorage.getItem(CLAVE_GUARDADO);
    if (texto) {
      const dato: unknown = JSON.parse(texto);
      if (esDocumento(dato)) return dato;
    }
  } catch {
    // Sin almacenamiento disponible: se empieza con un ejemplo.
  }
  return EJEMPLOS[0]!.documento;
}

/** Firma de la forma del circuito: elementos y nodos, sin valores. */
function firma(elementos: Elemento[]): string {
  return elementos
    .map((e) => {
      const nodos = Object.entries(e)
        .filter(([k, v]) => typeof v === 'string' && k !== 'nombre' && k !== 'tipo')
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(',');
      return `${e.tipo}:${e.nombre}:${nodos}`;
    })
    .join('|');
}

function textoValor(pieza: Pieza): string | undefined {
  const p = pieza.parametros;
  if (p.resistencia_ohm !== undefined) return conPrefijo(p.resistencia_ohm, 'Ω');
  if (p.capacitancia_f !== undefined) return conPrefijo(p.capacitancia_f, 'F');
  if (p.inductancia_h !== undefined) return conPrefijo(p.inductancia_h, 'H');
  if (pieza.tipo === 'fuente_dc') return conPrefijo(p.voltaje_v ?? 0, 'V');
  if (pieza.tipo === 'fuente_senal') return `${conPrefijo(p.amplitud_v ?? 0, 'V')} ${conPrefijo(p.frecuencia_hz ?? 0, 'Hz')}`;
  return undefined;
}

export function App() {
  const catalogo = useMemo(() => armarCatalogo(BIBLIOTECA), []);
  const [doc, setDoc] = useState<Documento>(cargarGuardado);
  const [pasado, setPasado] = useState<Documento[]>([]);
  const [futuro, setFuturo] = useState<Documento[]>([]);
  const [vista, setVista] = useState<Vista>('esquema');
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [colocando, setColocando] = useState<DefPieza | null>(null);
  const [velocidad, setVelocidad] = useState(1);
  const sim = useSimulador();
  const archivo = useRef<HTMLInputElement | null>(null);
  const docAntesDeArrastre = useRef<Documento | null>(null);
  /** Se incrementa para pedirle al lienzo que encuadre todo el circuito. */
  const [encuadre, setEncuadre] = useState(0);

  // ---------- Historial (deshacer / rehacer) ----------
  const confirmar = useCallback(
    (nuevo: Documento) => {
      const anterior = docAntesDeArrastre.current ?? doc;
      docAntesDeArrastre.current = null;
      if (nuevo === anterior) return;
      setPasado((p) => [...p.slice(-99), anterior]);
      setFuturo([]);
      setDoc(nuevo);
    },
    [doc],
  );
  const enVivo = useCallback(
    (nuevo: Documento) => {
      if (!docAntesDeArrastre.current) docAntesDeArrastre.current = doc;
      setDoc(nuevo);
    },
    [doc],
  );
  const deshacer = useCallback(() => {
    if (pasado.length === 0) return;
    setPasado(pasado.slice(0, -1));
    setFuturo([doc, ...futuro]);
    setDoc(pasado[pasado.length - 1]!);
  }, [pasado, futuro, doc]);
  const rehacer = useCallback(() => {
    if (futuro.length === 0) return;
    setPasado([...pasado, doc]);
    setFuturo(futuro.slice(1));
    setDoc(futuro[0]!);
  }, [pasado, futuro, doc]);

  // Guardado automático en el navegador.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(doc));
      } catch {
        // Sin almacenamiento: no pasa nada, el circuito sigue en pantalla.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [doc]);

  // ---------- Circuito para el motor ----------
  const armado = useMemo(() => armarCircuito(doc, BIBLIOTECA), [doc]);
  const nodosSonda = useMemo(() => {
    const canal = (n: number) => {
      const sonda = doc.piezas.find((p) => p.tipo === 'sonda' && (p.parametros.canal ?? 1) === n);
      return sonda ? armado.nodoDePin.get(`${sonda.id}:p`) : undefined;
    };
    return [canal(1), canal(2)] as [string | undefined, string | undefined];
  }, [doc.piezas, armado]);
  const firmaEnviada = useRef('');

  const simular = useCallback(() => {
    if (armado.problemas.length > 0) return;
    firmaEnviada.current = firma(armado.elementos);
    sim.iniciar(armado.elementos, velocidad, nodosSonda.filter((n): n is string => !!n));
  }, [armado, velocidad, nodosSonda, sim]);

  // Mientras simula: cambios de valores en vivo; cambios de forma reinician.
  useEffect(() => {
    if (!sim.corriendo || armado.problemas.length > 0) return;
    const nueva = firma(armado.elementos);
    if (nueva === firmaEnviada.current) sim.actualizar(armado.elementos);
    else simular();
    // simular cambia con armado; aquí solo interesa reaccionar a armado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armado]);

  // ---------- Acciones ----------
  const elegirDePaleta = (d: DefPieza): void => {
    setColocando((actual) => (actual === d ? null : d));
    setSeleccion(null);
  };

  const piezaFantasma: Pieza | null = colocando
    ? { id: 'fantasma', tipo: colocando.tipo, ...(colocando.componenteId ? { componenteId: colocando.componenteId } : {}), nombre: '', x: 0, y: 0, rotacion: 0, parametros: { ...colocando.parametros } }
    : null;

  const colocar = (punto: Punto): void => {
    if (!colocando) return;
    const pieza: Pieza = {
      id: nuevoId('p'),
      tipo: colocando.tipo,
      ...(colocando.componenteId ? { componenteId: colocando.componenteId } : {}),
      nombre: nombreLibre(doc, colocando.prefijo),
      x: punto.x,
      y: punto.y,
      rotacion: 0,
      parametros: { ...colocando.parametros },
    };
    confirmar(agregarPieza(doc, pieza));
    setSeleccion(pieza.id);
    setColocando(null);
  };

  const clicPieza = (id: string): void => {
    const pieza = doc.piezas.find((p) => p.id === id);
    // Un clic sobre un interruptor lo abre o lo cierra (también simulando).
    if (pieza?.componenteId === 'interruptor') confirmar(cambiarParametro(doc, id, 'cerrado', (pieza.parametros.cerrado ?? 0) >= 0.5 ? 0 : 1));
  };

  const borrarSeleccion = useCallback(() => {
    if (!seleccion) return;
    confirmar(borrar(doc, new Set([seleccion])));
    setSeleccion(null);
  }, [seleccion, doc, confirmar]);

  const nuevo = (): void => {
    confirmar(DOCUMENTO_VACIO);
    setSeleccion(null);
  };

  const guardarArchivo = (): void => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = 'circuito.dmt.json';
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  const abrirArchivo = async (f: File): Promise<void> => {
    try {
      const dato: unknown = JSON.parse(await f.text());
      if (!esDocumento(dato)) throw new Error('no es un circuito de DMT Circuits');
      confirmar(dato);
      setEncuadre((n) => n + 1);
    } catch (error) {
      alert(`No pude abrir el archivo: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Teclado: R girar, Supr borrar, Ctrl+Z / Ctrl+Y, Esc cancelar.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) rehacer();
        else deshacer();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        rehacer();
      } else if (e.key === 'Escape') {
        setColocando(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && seleccion) {
        borrarSeleccion();
      } else if (e.key.toLowerCase() === 'r' && seleccion && doc.piezas.some((p) => p.id === seleccion)) {
        confirmar(rotarPieza(doc, seleccion));
      }
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [seleccion, doc, deshacer, rehacer, borrarSeleccion, confirmar]);

  // ---------- Lecturas, avisos y etiquetas ----------
  const lecturas = sim.lecturas;
  const avisos: Aviso[] = useMemo(
    () =>
      lecturas && sim.corriendo ? calcularAvisos(doc, armado, { voltajes: lecturas.voltajes, elementos: lecturas.elementos }, BIBLIOTECA) : [],
    [lecturas, sim.corriendo, doc, armado],
  );

  const corrientes = useMemo(() => {
    const mapa = new Map<string, number>();
    if (!lecturas) return mapa;
    for (const [pieza, elemento] of armado.elementoPrincipal) {
      const m = lecturas.elementos.get(elemento);
      if (m) mapa.set(pieza, m.corriente_a);
    }
    return mapa;
  }, [lecturas, armado]);

  const etiquetas = useMemo(() => {
    const mapa = new Map<string, Etiqueta>();
    for (const p of doc.piezas) {
      if (p.tipo === 'tierra') continue;
      const valor = textoValor(p);
      const componente = p.componenteId ? BIBLIOTECA.get(p.componenteId) : undefined;
      const texto = [p.nombre, valor ?? (componente && componente.pines.length > 2 && p.componenteId !== 'potenciometro' ? componente.id.toUpperCase() : undefined)]
        .filter(Boolean)
        .join(' ');
      let lectura: string | undefined;
      const principal = armado.elementoPrincipal.get(p.id);
      const m = principal ? lecturas?.elementos.get(principal) : undefined;
      if (m && p.tipo === 'voltimetro') lectura = conPrefijo(m.voltaje_v, 'V', 4);
      if (m && p.tipo === 'amperimetro') lectura = conPrefijo(m.corriente_a, 'A', 4);
      mapa.set(p.id, lectura ? { texto, lectura } : { texto });
    }
    return mapa;
  }, [doc.piezas, armado, lecturas]);

  const marcadas = useMemo(() => {
    const mapa = new Map<string, 'peligro' | 'atencion'>();
    for (const a of avisos) if (mapa.get(a.pieza) !== 'peligro') mapa.set(a.pieza, a.nivel);
    if (sim.error) {
      for (const nombre of sim.error.elementos) {
        const pieza = doc.piezas.find((p) => nombre === p.nombre || nombre.startsWith(`${p.nombre}.`));
        if (pieza) mapa.set(pieza.id, 'peligro');
      }
    }
    for (const problema of armado.problemas) mapa.set(problema.pieza, 'peligro');
    return mapa;
  }, [avisos, sim.error, doc.piezas, armado.problemas]);

  const piezaElegida = doc.piezas.find((p) => p.id === seleccion);
  const lecturaElegida = (() => {
    const principal = piezaElegida ? armado.elementoPrincipal.get(piezaElegida.id) : undefined;
    return principal ? lecturas?.elementos.get(principal) : undefined;
  })();

  // Nombres de nodos del motor → texto entendible en los errores ("N3" → "el punto que une R1 y C2").
  const mensajeError = sim.error?.mensaje;

  return (
    <div className="aplicacion">
      <header className="barra">
        <h1>DMT Circuits</h1>
        <div className="grupo">
          {sim.corriendo ? (
            <button className="principal detener" onClick={sim.detener}>
              ■ Detener
            </button>
          ) : (
            <button className="principal" onClick={simular} disabled={armado.problemas.length > 0 || doc.piezas.length === 0}>
              ▶ Simular
            </button>
          )}
          <select
            value={velocidad}
            onChange={(e) => {
              setVelocidad(Number(e.target.value));
              if (sim.corriendo) sim.detener();
            }}
            title="Velocidad de la simulación"
          >
            {VELOCIDADES.map((v) => (
              <option key={v.valor} value={v.valor}>
                {v.texto}
              </option>
            ))}
          </select>
        </div>
        <div className="grupo" role="group" aria-label="Vista">
          <button className={vista === 'esquema' ? 'activo' : ''} onClick={() => setVista('esquema')}>
            Esquema
          </button>
          <button className={vista === 'fisico' ? 'activo' : ''} onClick={() => setVista('fisico')}>
            Físico
          </button>
        </div>
        <div className="grupo">
          <button onClick={deshacer} disabled={pasado.length === 0} title="Deshacer (Ctrl+Z)">
            ↶
          </button>
          <button onClick={rehacer} disabled={futuro.length === 0} title="Rehacer (Ctrl+Y)">
            ↷
          </button>
        </div>
        <div className="grupo">
          <button onClick={nuevo}>Nuevo</button>
          <select
            value=""
            onChange={(e) => {
              const ejemplo = EJEMPLOS[Number(e.target.value)];
              if (ejemplo) {
                confirmar(ejemplo.documento);
                setEncuadre((n) => n + 1);
              }
            }}
          >
            <option value="" disabled>
              Ejemplos…
            </option>
            {EJEMPLOS.map((e, i) => (
              <option key={e.titulo} value={i}>
                {e.titulo}
              </option>
            ))}
          </select>
          <button onClick={guardarArchivo}>Guardar</button>
          <button onClick={() => archivo.current?.click()}>Abrir</button>
          <input
            ref={archivo}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void abrirArchivo(f);
              e.target.value = '';
            }}
          />
        </div>
        <div className="estado">
          {sim.corriendo && lecturas && (
            <>
              t = {conPrefijo(lecturas.tiempo_s, 's', 4)}
              {lecturas.atrasado && <span className="atrasado"> · tu equipo no alcanza esta velocidad: va más lento</span>}
            </>
          )}
        </div>
      </header>

      <Paleta catalogo={catalogo} elegida={colocando} onElegir={elegirDePaleta} />

      <main className="zona-lienzo">
        {(mensajeError || armado.problemas.length > 0) && (
          <div className="banda-error" role="alert">
            {mensajeError ?? armado.problemas.map((p) => p.mensaje).join(' ')}
          </div>
        )}
        {colocando && <div className="ayuda">Haz clic en el lienzo para colocar {colocando.titulo}. Esc cancela.</div>}
        {!colocando && doc.piezas.length === 0 && (
          <div className="ayuda">Elige un componente a la izquierda, o abre un ejemplo. Para cablear, haz clic en un pin.</div>
        )}
        <Lienzo
          doc={doc}
          biblioteca={BIBLIOTECA}
          vista={vista}
          seleccion={seleccion}
          colocando={piezaFantasma}
          corrientes={corrientes}
          etiquetas={etiquetas}
          marcadas={marcadas}
          onSeleccionar={setSeleccion}
          onColocar={colocar}
          onConfirmar={confirmar}
          onCambiarEnVivo={enVivo}
          onCables={(tramos) => confirmar(agregarCables(doc, tramos))}
          onClicPieza={clicPieza}
          encuadre={encuadre}
        />
        <p className="atajos">
          Clic en un pin: cablear · Doble clic o clic derecho: terminar cable · R: girar · Supr: borrar · Rueda: zoom · Arrastrar el fondo: mover
        </p>
      </main>

      <aside className="lateral">
        {piezaElegida ? (
          <Propiedades
            pieza={piezaElegida}
            def={definicionDe(catalogo, piezaElegida.tipo, piezaElegida.componenteId)}
            lectura={lecturaElegida}
            avisos={avisos.filter((a) => a.pieza === piezaElegida.id)}
            onCambiar={(clave, valor) => confirmar(cambiarParametro(doc, piezaElegida.id, clave, valor))}
            onRotar={() => confirmar(rotarPieza(doc, piezaElegida.id))}
            onBorrar={borrarSeleccion}
          />
        ) : (
          <div className="propiedades vacia">
            <p>Elige una pieza para ver y cambiar sus valores.</p>
            {avisos.length > 0 && (
              <>
                <h2>Avisos</h2>
                {avisos.map((a, i) => (
                  <p key={i} className={`aviso ${a.nivel}`}>
                    {a.mensaje}
                  </p>
                ))}
              </>
            )}
          </div>
        )}
        <Osciloscopio historial={sim.historial.current} canales={nodosSonda} version={sim.version} />
      </aside>
    </div>
  );
}
