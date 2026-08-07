import * as fs from 'fs';
import * as path from 'path';
import { preRender } from './prerender';

export async function runCLI(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  let outDirOverride: string | null = null;
  const filePaths: string[] = [];

  // 1. Loop and parse flags out of the raw CLI string tokens
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--outDir') {
      outDirOverride = rawArgs[i + 1] || null;
      i++; // Skip the next index since it's the directory path value
    } else {
      filePaths.push(rawArgs[i]);
    }
  }

  if (filePaths.length === 0) {
    console.error("Error: Supply at least one target HTML path. E.g., npm run prerender src/index.html --outDir dist");
    process.exit(1);
  }

  for (const filePath of filePaths) {
    const absoluteInputPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(absoluteInputPath)) {
      console.warn(`[SSR Build Warning] File target not found, skipping: ${filePath}`);
      continue;
    }

    try {
      console.log(`[SSR] Pre-rendering asset tree for: ${filePath}...`);
      const rawHtml = fs.readFileSync(absoluteInputPath, 'utf-8');
      const compiledHtml = await preRender(rawHtml, path.dirname(absoluteInputPath));

      const parsedPath = path.parse(absoluteInputPath);
      
      // 2. Resolve output paths dynamically using the custom override flag or local fallback defaults
      let targetDirectory: string;
      if (outDirOverride) {
        targetDirectory = path.resolve(process.cwd(), outDirOverride);
      } else {
        targetDirectory = path.join(parsedPath.dir, 'dist');
      }

      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, { recursive: true });
      }

      const absoluteOutputPath = path.join(targetDirectory, parsedPath.base);
      fs.writeFileSync(absoluteOutputPath, compiledHtml, 'utf-8');
      
      console.log(`[SSR Success] Exported DSD bundle to: ${absoluteOutputPath}`);
    } catch (err: any) {
      console.error(`[SSR Crash] Failed prerendering asset: ${filePath}`, err.message);
    }
  }
}
