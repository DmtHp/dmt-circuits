# DMT Circuits: guía para Claude

## Resumen del proyecto

Simulador de circuitos electrónicos como aplicación web. La descripción completa está en [docs/PROYECTO.md](docs/PROYECTO.md): léela entera antes de proponer cambios grandes.

- Kit básico de componentes y un **motor de cálculo propio** (análisis nodal modificado, MNA) que responde en tiempo real.
- Su diferencia: un solo botón **"Crear componente"**. El usuario pega el código o suelta un archivo JSON (escrito a mano o generado por una IA), la app detecta la categoría, lo valida en tres filtros (formato, reglas de la categoría y prueba eléctrica con valores del datasheet) y lo agrega con un clic.
- La app genera el símbolo y el encapsulado físico de cada componente.
- Todo debe ser medible y verificable: contra el cálculo a mano, el datasheet y el circuito real.

## Reglas de trabajo

- **Responde siempre en español.** El usuario es estudiante de Tecnología en Electrónica Industrial: explica los conceptos de electrónica y de programación que uses, con palabras simples y, cuando ayude, con el cálculo a mano.
- **Una etapa a la vez**, según la hoja de ruta de docs/PROYECTO.md. No adelantes trabajo de etapas siguientes.
- **Antes de escribir código en cada etapa**, explica qué vas a hacer, por qué y cómo quedará organizado, y espera la aprobación del usuario.
- **Todo el código es propio.** Proteus y similares solo sirven de inspiración y para comparar resultados. No copiar código de proyectos GPL (por ejemplo CircuitJS1).
- **El motor vive separado de la interfaz** y se puede probar solo, sin UI.
- **Los archivos de componentes nunca contienen código ejecutable**: nada de `eval` ni `new Function`. Si se permiten expresiones matemáticas, se interpretan con un analizador propio.
- **Cada función del motor lleva pruebas** con resultados verificables a mano (el valor esperado se justifica en un comentario con el cálculo).
- **El rendimiento importa**: la app debe funcionar bien en computadores modestos. No agregar dependencias pesadas sin explicar por qué hacen falta.
- **Web estática**: la app se publica sin servidor (GitHub Pages) y se abre con un enlace.
- **Git y GitHub (autorizado por el usuario el 2026-11-21):** puedes hacer commits y `git push` a `main` sin preguntar, siempre que typecheck, lint y pruebas pasen antes. Pregunta antes de abrir pull requests, borrar ramas, repositorios o archivos del historial, o reescribir el historial (`push --force`, `rebase` de lo ya subido).
- Pedir aprobación antes de instalar dependencias nuevas.

## Stack

- TypeScript (modo `strict`), React, Vite.
- Pruebas: Vitest. Lint: ESLint.
- En la app, el motor corre en un Web Worker, pero su código es TypeScript puro sin dependencias de navegador.

## Estructura de carpetas (aprobada el 2026-11-21)

```
dmt-circuits/
├─ CLAUDE.md
├─ README.md
├─ docs/
│  └─ PROYECTO.md
├─ engine/                 ← motor de cálculo (MNA). Sin React, sin DOM.
│  ├─ src/
│  └─ tests/               ← pruebas con resultados calculados a mano
├─ components/             ← formato JSON de componentes, categorías y validación
│  ├─ src/
│  │  └─ categorias/       ← reglas por categoría (pasivo, diodo, op-amp, compuerta)
│  ├─ biblioteca/          ← componentes del kit en JSON
│  └─ tests/
├─ app/                    ← interfaz web (React + Vite)
│  ├─ index.html
│  ├─ public/
│  └─ src/
├─ package.json, tsconfig.json, vite.config.ts, eslint.config.js
└─ .gitignore
```

Reglas de dependencia entre carpetas:
- `engine` no importa nada de `components` ni de `app`.
- `components` puede importar de `engine` (los modelos se arman con primitivas del motor), nunca de `app`.
- `app` puede importar de ambos.

## Convenciones

- Nombres de dominio en español (`resistencia`, `nodo`, `fuenteVoltaje`); términos de programación en inglés cuando sea lo habitual (`test`, `worker`).
- Unidades SI en el código. Si un nombre lleva unidad, que se note: `capacitancia_f`, `slew_v_us`.
- Commits pequeños y descriptivos en español.

## Comandos

- `npm run dev`: app en modo desarrollo.
- `npm test`: pruebas (Vitest, en Node): `engine/tests`, `components/tests` y `app/tests` (solo la lógica pura de la interfaz, como la conectividad del lienzo).
- `npm run lint`: ESLint. Hace cumplir el sentido de las dependencias y prohíbe `eval`/`new Function`.
- `npm run typecheck`: revisión de tipos de TypeScript.
- `npm run build`: web estática en `dist/` (rutas relativas, `base: './'`).
- Publicación: `.github/workflows/deploy.yml` publica en GitHub Pages con cada push a `main`.

Antes de dar una tarea por terminada: `npm run typecheck`, `npm run lint` y `npm test` deben pasar.
