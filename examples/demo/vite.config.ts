import { resolve } from 'path';
import { defineConfig } from 'vite';
// Import the prerenderer plugin from your local sibling workspace
import { matchboxPrerenderPlugin } from '@matchbox/prerender/vite';

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [
    matchboxPrerenderPlugin(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  base: "./",
});
