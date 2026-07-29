import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/Pdf-Hub/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Rolldown (this project's bundler under Vite 8) only accepts a
        // function for manualChunks, not classic Rollup's object-of-arrays
        // shorthand — same vendor grouping, function form.
        manualChunks(id: string) {
          const vendorGroups: Record<string, string[]> = {
            'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
            'vendor-lexical': ['lexical', '@lexical/react', '@lexical/rich-text',
                               '@lexical/table', '@lexical/list', '@lexical/link',
                               '@lexical/html', '@lexical/utils', '@lexical/selection',
                               '@lexical/history', '@lexical/code'],
            'vendor-pdf':     ['pdf-lib', 'pdfjs-dist'],
            'vendor-canvas':  ['konva', 'react-konva', 'html2canvas'],
            'vendor-docs':    ['docx', 'jszip', 'fflate'],
          };

          if (!id.includes('node_modules')) return undefined;

          for (const [chunkName, packages] of Object.entries(vendorGroups)) {
            if (packages.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
              return chunkName;
            }
          }

          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', 'e2e-report.spec.ts'],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Vitest skips coverage report generation entirely when any test fails,
      // unless this is set — without it, this repo's 4 pre-existing unrelated
      // test failures (see tasks/DRIFT-REPORT.md Finding 5) would silently
      // suppress the coverage/threshold report on every run.
      reportOnFailure: true,
      include: ['src/core/**', 'src/adapters/**', 'src/components/**/*.{ts,tsx}'],
      // Per-glob thresholds (not the top-level lines/functions/branches/statements
      // keys) so src/components's lower bar doesn't dilute the src/core and
      // src/adapters 80% floor — Vitest's top-level threshold keys apply to the
      // FULL combined coverage map across every included file, glob-matched or
      // not, so setting them here would check core+adapters+components together.
      thresholds: {
        'src/core/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        'src/adapters/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        // Measured 2026-07-29: lines 40.47%, statements 39.95%, functions
        // 39.79%, branches 35.08% — rounded down to the nearest 5. Ratchet
        // upward as component test coverage grows.
        'src/components/**/*.{ts,tsx}': {
          lines: 40,
          functions: 35,
          branches: 35,
          statements: 35,
        },
      },
    },
  },
});
