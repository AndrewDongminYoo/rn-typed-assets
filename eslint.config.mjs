import js from '@eslint/js';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import jest from 'eslint-plugin-jest';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js },
    languageOptions: { globals: globals.node },
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: { globals: globals.node },
    extends: [tseslint.configs.recommendedTypeChecked],
  },
  {
    files: ['**/*.{test.js,test.ts,test.tsx}', 'jest.setup.js'],
    ...jest.configs['flat/recommended'],
  },
  {
    files: ['**/*.json'],
    plugins: { json },
    language: 'json/json',
    extends: ['json/recommended'],
    ignores: ['package-lock.json'],
  },
  {
    files: ['**/*.md'],
    plugins: { markdown },
    language: 'markdown/gfm',
    extends: ['markdown/recommended'],
  },
]);
