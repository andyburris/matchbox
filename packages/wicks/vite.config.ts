import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({ tsconfigPath: "./tsconfig.json" }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es']
    },
    rollupOptions: {
      external: [/^lit-html(\/.*)?$/],
      // One file per module, so a consumer's bundler can drop components they never import
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(import.meta.dirname, 'src'),
        entryFileNames: '[name].js',
      },
    },
    sourcemap: true,
    minify: false
  }
});
