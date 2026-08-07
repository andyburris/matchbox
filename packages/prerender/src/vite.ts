import * as path from 'node:path';
import type { Plugin } from 'vite';
import { prerenderFile } from './prerender.js';

export function matchboxPrerenderPlugin(): Plugin {
  return {
    name: 'vite-plugin-matchbox-prerender',
    apply: 'build',
    enforce: 'post',

    // writeBundle runs once every file is written — the earliest point the sandbox
    // can actually fetch the built module scripts referenced by the HTML.
    async writeBundle(options, bundle) {
      if (!options.dir) return;

      for (const output of Object.values(bundle)) {
        if (output.type !== 'asset' || !output.fileName.endsWith('.html')) continue;
        await prerenderFile(path.resolve(options.dir, output.fileName));
      }
    }
  };
}