import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // This app intentionally colocates small exported helpers, constants, and
      // test-facing adapters next to some components. Keeping this rule enabled
      // creates noisy CI warnings without improving runtime correctness.
      'react-refresh/only-export-components': 'off',
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.name=/^use(Session|WriterV2|Ocr|Annotation|Editor|Review|Search)Store$/][arguments.length=0]",
        message: 'Subscribe with a selector (use useShallow for object selections).',
      }],
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'pdf-lib', message: 'Use await pdfLib() from @/core/pdf/lazyPdfLib.' },
          { name: 'html2canvas', message: 'Import dynamically at the call site.' },
        ],
      }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'src/core/pdf/lazyPdfLib.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  }
);
