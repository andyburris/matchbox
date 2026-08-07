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
      name: 'MatchboxCore',
      fileName: 'matchbox-core',
      formats: ['es'] // Output standard modern EcmaScript Modules
    },
    rollupOptions: {
      // Don't bundle lit-html into the library file; let the user's project provide it
      external: ['lit-html']
    },
    sourcemap: true,
    minify: false // Useful to keep unminified for debugger readability in monorepos
  }
});
