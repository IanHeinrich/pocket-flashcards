import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/core/**/*.js'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ is pure: no DOM.' },
        { name: 'document', message: 'core/ is pure: no DOM.' },
        { name: 'indexedDB', message: 'core/ is pure: no storage.' },
        { name: 'localStorage', message: 'core/ is pure: no storage.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/**', '**/ui/**'],
              message: 'core/ imports nothing outside core/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/services/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/ui/**'], message: 'services/ never imports ui/.' }] },
      ],
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: 'error',
      'prefer-const': 'error',
    },
  },
];
