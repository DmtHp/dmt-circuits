/** Paleta de piezas y panel de propiedades de la pieza elegida. */

import { useState } from 'react';
import { leerValor } from '../../../engine/src';
import { conPrefijo, type Aviso } from '../modelo/avisos';
import type { Pieza } from '../modelo/documento';
import type { DefEditable, DefPieza } from '../modelo/piezas';

export function Paleta({ catalogo, elegida, onElegir }: { catalogo: DefPieza[]; elegida: DefPieza | null; onElegir(d: DefPieza): void }) {
  const grupos = [...new Set(catalogo.map((d) => d.grupo))];
  return (
    <nav className="paleta" aria-label="Componentes">
      {grupos.map((g) => (
        <section key={g}>
          <h2>{g}</h2>
          {catalogo
            .filter((d) => d.grupo === g)
            .map((d) => (
              <button
                key={`${d.tipo}-${d.componenteId ?? ''}`}
                className={elegida === d ? 'elegida' : ''}
                onClick={() => onElegir(d)}
                title={`Colocar: ${d.titulo}`}
              >
                {d.titulo}
              </button>
            ))}
        </section>
      ))}
    </nav>
  );
}

/** Texto editable de un valor: 4700 → "4.7k". */
function aTexto(valor: number): string {
  return conPrefijo(valor, '').replace(/\s/g, '').replace('µ', 'u').replace('M', 'meg');
}

/** Campo de valor. Se monta de nuevo (key) cuando el valor cambia desde afuera. */
function CampoValor({ def, valor, onCambiar }: { def: DefEditable; valor: number; onCambiar(v: number): void }) {
  const [texto, setTexto] = useState(aTexto(valor));
  const [error, setError] = useState(false);
  const confirmar = (): void => {
    const v = leerValor(texto.trim());
    if (v === null) {
      setError(true);
      return;
    }
    setError(false);
    onCambiar(v);
  };
  return (
    <label>
      {def.etiqueta}
      <span className="campo-con-unidad">
        <input
          value={texto}
          aria-invalid={error}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmar();
          }}
        />
        <span>{def.unidad}</span>
      </span>
      {error && <small className="error-campo">Escribe un número con sufijo opcional: 4.7k, 100n, 2meg.</small>}
    </label>
  );
}

export function Propiedades({
  pieza,
  def,
  lectura,
  avisos,
  onCambiar,
  onRotar,
  onBorrar,
}: {
  pieza: Pieza;
  def: DefPieza | undefined;
  lectura: { voltaje_v: number; corriente_a: number; potencia_w: number } | undefined;
  avisos: Aviso[];
  onCambiar(clave: string, valor: number): void;
  onRotar(): void;
  onBorrar(): void;
}) {
  return (
    <aside className="propiedades" aria-label="Propiedades">
      <h2>{pieza.nombre}</h2>
      <p className="subtitulo">{def?.titulo}</p>
      {def?.editables.map((e) => {
        const valor = pieza.parametros[e.clave] ?? 0;
        switch (e.control) {
          case 'valor':
            return <CampoValor key={`${pieza.id}:${e.clave}:${valor}`} def={e} valor={valor} onCambiar={(v) => onCambiar(e.clave, v)} />;
          case 'deslizador':
            return (
              <label key={e.clave}>
                {e.etiqueta}: {Math.round(valor * 100)} %
                <input type="range" min={0} max={1} step={0.01} value={valor} onChange={(ev) => onCambiar(e.clave, Number(ev.target.value))} />
              </label>
            );
          case 'interruptor':
            return (
              <label key={e.clave} className="fila">
                <input type="checkbox" checked={valor >= 0.5} onChange={(ev) => onCambiar(e.clave, ev.target.checked ? 1 : 0)} />
                {e.etiqueta} <small>(también con un clic sobre la pieza)</small>
              </label>
            );
          case 'opcion':
            return (
              <label key={e.clave}>
                {e.etiqueta}
                <select value={valor} onChange={(ev) => onCambiar(e.clave, Number(ev.target.value))}>
                  {e.opciones?.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.texto}
                    </option>
                  ))}
                </select>
              </label>
            );
        }
        return null;
      })}
      {lectura && (
        <dl className="lecturas">
          <dt>Voltaje</dt>
          <dd>{conPrefijo(lectura.voltaje_v, 'V')}</dd>
          <dt>Corriente</dt>
          <dd>{conPrefijo(lectura.corriente_a, 'A')}</dd>
          <dt>Potencia</dt>
          <dd>{conPrefijo(lectura.potencia_w, 'W')}</dd>
        </dl>
      )}
      {avisos.map((a, i) => (
        <p key={i} className={`aviso ${a.nivel}`}>
          {a.mensaje}
        </p>
      ))}
      <div className="botones">
        <button onClick={onRotar} title="Girar 90° (tecla R)">
          Girar
        </button>
        <button onClick={onBorrar} title="Borrar (tecla Supr)">
          Borrar
        </button>
      </div>
    </aside>
  );
}
