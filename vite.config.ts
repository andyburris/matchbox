import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    // Development configuration: Serve the examples module
    return {
      root: 'examples/demo',
      server: {
        port: 3000,
      },
    };
  } else {
    // Production configuration: Build the src library
    return {
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'Matchbox',
          fileName: (format) => `index.${format}.js`,
          formats: ['es', 'cjs'],
        },
        outDir: 'dist',
        sourcemap: true,
        emptyOutDir: true,
      },
      plugins: [],
    };
  }
});