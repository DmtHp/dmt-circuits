import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La interfaz vive en app/. El resultado del build va a dist/.
// base: './' usa rutas relativas, así la página funciona en GitHub Pages
// sin importar el nombre del repositorio.
export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
