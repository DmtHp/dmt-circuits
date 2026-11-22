# DMT Circuits

Simulador de circuitos electrónicos en el navegador, con motor de cálculo propio (análisis nodal modificado) y componentes que se pueden crear desde un archivo JSON, a mano o con ayuda de una IA. La descripción completa está en [docs/PROYECTO.md](docs/PROYECTO.md).

**Estado:** Etapa 4 (interfaz). Ya se puede usar en el navegador: colocar componentes del kit, cablear, simular en tiempo real (el motor corre en un Web Worker), cambiar valores en vivo, ver el esquema o el encapsulado físico, medir con voltímetro, amperímetro y osciloscopio, y recibir avisos como "este LED se quemaría". Falta la Etapa 5: crear componentes con IA desde la app.

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
