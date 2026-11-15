import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'vendor/**', 'models/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/test-page/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
);
