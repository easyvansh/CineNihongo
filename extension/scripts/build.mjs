import { build } from 'vite';
import { resolve } from 'node:path';
const watch = process.argv.includes('--watch') ? {} : undefined;
// executeScript loads classic scripts: shared ESM imports cannot appear here.
await build({ build: { watch, emptyOutDir: !watch } });
await build({
  configFile: false,
  build: {
    watch, emptyOutDir: false,
    lib: { entry: resolve('src/content/index.ts'), name: 'CineNihongo', formats: ['iife'], fileName: () => 'assets/content.js' },
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
