import { defineConfig } from 'vite';
import {
  fileURLToPath,
} from 'node:url';

const entry = fileURLToPath(
  new URL(
    './src/sdk-client/pdf-hub-sdk-client.ts',
    import.meta.url,
  ),
);

export default defineConfig({
  build: {
    lib: {
      entry,
      name: 'PDFHubSDKClient',
      formats: ['es', 'iife'],
      fileName(format) {
        return format === 'es'
          ? 'pdf-hub-sdk-client.js'
          : 'pdf-hub-sdk-client.global.js';
      },
    },
    outDir: 'dist-sdk-client',
    emptyOutDir: true,
    sourcemap: true,
    minify: true,
  },
});
