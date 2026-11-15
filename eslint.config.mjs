/** Configure linting for Node source and regression tests. */
import js from '@eslint/js';
import globals from 'globals';
export default [
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  { ignores: ['node_modules/**', 'storage/**'] }
];
