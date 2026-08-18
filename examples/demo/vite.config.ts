import { resolve } from 'path';
import { defineConfig } from 'vite';
// Import the prerenderer plugin from your local sibling workspace
import { matchboxPrerenderPlugin } from '@matchbox/prerender/vite';
import type { Plugin } from 'vite';

function delayAssets(ms: number): Plugin {
  return {
    name: 'delay-assets',
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (ms && req.url?.endsWith('.js')) setTimeout(next, ms);
        else next();
      });
    },
  };
}


export default defineConfig({
  root: resolve(import.meta.dirname),
  resolve: { dedupe: ['lit-html'] },
  plugins: [
    matchboxPrerenderPlugin(),
    delayAssets(5000),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  base: "./",
});
