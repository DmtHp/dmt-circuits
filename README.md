# DMT Circuits

Simulador de circuitos electrónicos en el navegador, con motor de cálculo propio (análisis nodal modificado) y componentes que se pueden crear desde un archivo JSON, a mano o con ayuda de una IA. La descripción completa está en [docs/PROYECTO.md](docs/PROYECTO.md).

**Estado:** Etapa 2 (motor completo sin interfaz). El motor resuelve el punto de operación DC (también con diodos, zener y op-amps que saturan, usando Newton-Raphson) y el análisis transitorio con condensadores, bobinas y fuentes de seno y pulso. Se prueba con netlists de texto; todavía no hay lienzo.

## Requisitos

- Node.js 24 o superior (incluye npm).

## Comandos

```bash
npm install        # instala las dependencias (una sola vez)
npm run dev        # abre la app en modo desarrollo (http://localhost:5173)
npm test           # corre las pruebas del motor y de los componentes
npm run lint       # revisa el código con ESLint
npm run build      # genera la web estática en dist/
npm run preview    # sirve dist/ para verla como quedará publicada
```

## Organización

| Carpeta | Qué contiene |
| --- | --- |
| `engine/` | Motor de cálculo. TypeScript puro, sin interfaz. |
| `components/` | Formato JSON de componentes, categorías, validación y biblioteca. |
| `app/` | Interfaz web (React + Vite). |
| `docs/` | Documentación del proyecto. |

Las dependencias van en un solo sentido: `app` → `components` → `engine`. ESLint marca un error si se rompe esa regla.

## Publicación

La app se publica en GitHub Pages automáticamente con cada cambio en la rama `main` (ver `.github/workflows/deploy.yml`).
