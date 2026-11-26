import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module', ecmaVersion: 'latest' } },
    rules: { 'no-unused-vars': 'off' }
  },
  {
    files: ['server/src/**/*.js', 'server/test/**/*.js'],
    languageOptions: { globals: { ...globals.node }, parserOptions: { sourceType: 'module', ecmaVersion: 'latest' } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] }
  }
];
