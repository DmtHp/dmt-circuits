# DMT Circuits

Simulador de circuitos electrónicos en el navegador, con motor de cálculo propio (análisis nodal modificado) y componentes que se pueden crear desde un archivo JSON, a mano o con ayuda de una IA. La descripción completa está en [docs/PROYECTO.md](docs/PROYECTO.md).

**Estado:** Etapa 3 (formato de componentes). El motor resuelve DC y transitorio, y `components/` valida componentes en JSON con tres filtros (formato, reglas de la categoría y pruebas eléctricas contra el datasheet). El kit básico está en `components/biblioteca/`. Todavía no hay lienzo.

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
