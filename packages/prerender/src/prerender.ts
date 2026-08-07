import { HTMLSerializer, Window } from 'happy-dom';
import jsBeautify from "js-beautify";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { captureStyleSheetSources, patchCustomElementUpgrade } from "./fix-happy-dom.js";
import { inlineAdoptedStyleSheets } from "./css.js";

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

  patchCustomElementUpgrade(window)
  captureStyleSheetSources(window)
  gateBrowserOnlyAPIs(window)

  window.document.write(rawHTML);

  await window.happyDOM.waitUntilComplete();

  // Dump Happy DOM's private error & log history
  // const happyConsoleOutput = (window.happyDOM as any).virtualConsolePrinter?.readAsString();
  // if (happyConsoleOutput) {
  //   console.log("\n--- HEADLESS BROWSER CONSOLE LOGS ---");
  //   console.log(happyConsoleOutput);
  //   console.log("----------------------------------------\n");
  // }

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

const BROWSER_ONLY_APIS = ['localStorage', 'sessionStorage', 'indexedDB'] as const;

/** Touching one of these throws, which marks that component as un-prerenderable. */
function gateBrowserOnlyAPIs(window: Window): void {
  for (const name of BROWSER_ONLY_APIS) {
    const unavailable = new Proxy({}, {
      get(_, property) {
        throw new Error(`${name}.${String(property)} is not available during prerendering`);
      }
    });
    Object.defineProperty(window, name, { configurable: true, writable: true, value: unavailable });
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: () => { throw new Error('matchMedia is not available during prerendering'); }
  });
}