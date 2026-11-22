import { defineConfig } from 'vitest/config';

// Las pruebas corren en Node, sin navegador. En app/ solo se prueba la lógica pura (modelo), no la pantalla.
export default defineConfig({
  test: {
    include: ['engine/tests/**/*.test.ts', 'components/tests/**/*.test.ts', 'app/tests/**/*.test.ts'],
    environment: 'node',
  },
});
