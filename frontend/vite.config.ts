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
      include: ['src/core/**', 'src/adapters/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
