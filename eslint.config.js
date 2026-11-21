import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Regla de seguridad del proyecto: nunca ejecutar texto como código.
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // El motor no conoce ni los componentes ni la interfaz.
    files: ['engine/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/components/**', '**/app/**'], message: 'El motor no puede depender de components ni de app.' },
          { group: ['react', 'react-dom', 'react/*'], message: 'El motor no usa React.' },
        ],
      }],
    },
  },
  {
    // Los componentes pueden usar el motor, pero nunca la interfaz.
    files: ['components/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/app/**'], message: 'components no puede depender de app.' },
          { group: ['react', 'react-dom', 'react/*'], message: 'components no usa React.' },
        ],
      }],
    },
  },
  {
    files: ['app/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
