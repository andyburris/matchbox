import { defineConfig } from 'vite';
import { resolve } from 'path';
// Import the pre-renderer plugin from your local sibling workspace
import { preRender } from '@matchbox/ssr';

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [
    // Runs automatically during 'vite build' pipelines!
    // yourFrameworkPreRenderPlugin(preRender)
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  base: "./",
});
