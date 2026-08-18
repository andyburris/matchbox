#!/usr/bin/env node

import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { prerenderFile } from '../prerender.js';

runCLI().catch((error) => {
  console.error(error);
  process.exit(1);
});


async function runCLI(args = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: { outDir: { type: 'string' } },
    allowPositionals: true
  });

  if (positionals.length === 0) {
    console.error('Usage: matchbox-prerender <html...> [--outDir <dir>]');
    process.exitCode = 1;
    return;
  }

  for (const filePath of positionals) {
    const inputPath = path.resolve(process.cwd(), filePath);
    const outputPath = path.resolve(process.cwd(), values.outDir ?? 'dist', path.basename(inputPath));

    try {
      await prerenderFile(inputPath, outputPath);
      console.log(`[matchbox] prerendered ${path.relative(process.cwd(), outputPath)}`);
    } catch (error) {
      console.error(`[matchbox] failed to prerender ${filePath}:`, error);
      process.exitCode = 1;
    }
  }
}
