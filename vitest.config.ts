import { defineConfig } from 'vitest/config';

// Las pruebas del motor y de los componentes corren en Node, sin navegador.
export default defineConfig({
  test: {
    include: ['engine/tests/**/*.test.ts', 'components/tests/**/*.test.ts'],
    environment: 'node',
  },
});
