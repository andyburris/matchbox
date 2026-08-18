import { HTMLSerializer, Window } from 'happy-dom';
import jsBeautify from "js-beautify";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { inlineAdoptedStyleSheets } from "./css.js";
import { collectHydratableRoots, markPartExtents } from "./dom.js";
import { captureStyleSheetSources, patchCustomElementUpgrade } from "./fix-happy-dom.js";
import { gateBrowserOnlyAPIs } from "./browseronly.js";

/** Prerenders an HTML file on disk. Assets resolve relative to the file's own directory. */
export async function prerenderFile(inputPath: string, outputPath = inputPath): Promise<void> {
  const rawHTML = await fs.readFile(inputPath, 'utf-8');
  const compiledHTML = await prerender(rawHTML, path.dirname(inputPath));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, compiledHTML, 'utf-8');
}


export async function prerender(rawHTML: string, baseDir: string): Promise<string> {
  const window = new Window({
    url: 'http://localhost:4567',
    settings: {
      enableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: false,
      disableCSSFileLoading: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,

      fetch: {
        virtualServers: [
          {
            url: 'http://localhost:4567/',
            directory: baseDir // Happy DOM serves all script imports from here
          }
        ]
      }
    },
  });

  patchCustomElementUpgrade(window);
  captureStyleSheetSources(window);
  gateBrowserOnlyAPIs(window);

  window.document.write(rawHTML);

  // await window.happyDOM.waitUntilComplete();
  // // @ts-expect-error
  // window.matchboxinit();
  
  await window.happyDOM.waitUntilComplete();

  // Dump Happy DOM's private error & log history
  // const happyConsoleOutput = (window.happyDOM as any).virtualConsolePrinter?.readAsString();
  // if (happyConsoleOutput) {
  //   console.log("\n--- HEADLESS BROWSER CONSOLE LOGS ---");
  //   console.log(happyConsoleOutput);
  //   console.log("----------------------------------------\n");
  // }

  const hydratable = collectHydratableRoots(window.document as any);
  const hydrationConfigured = (window as unknown as { __matchboxHydration?: boolean }).__matchboxHydration;
  if (hydratable.length > 0 && !hydrationConfigured) {
    throw new Error(
      `[matchbox] ${hydratable.length} prerendered component${hydratable.length === 1 ? "" : "s"} need${hydratable.length === 1 ? "s" : ""} hydration. ` +
      `Pass \`hydrate\` to configureMatchbox().`
    );
  }
  markPartExtents(hydratable);

  await inlineAdoptedStyleSheets(window.document as any, baseDir);
  const serializer = new HTMLSerializer({ allShadowRoots: true });
  const compiledHTML = serializer.serializeToString(window.document);
  const beautifiedHTML = jsBeautify.html(compiledHTML, {
    indent_size: 2,
    wrap_line_length: 0,
    preserve_newlines: true,
  })

  await window.happyDOM.close();
  return beautifiedHTML;
}