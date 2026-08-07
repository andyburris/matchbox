import { HTMLSerializer, Window } from 'happy-dom';
import jsBeautify from "js-beautify";
import { runCLI } from "./cli";
import { patchCustomElementUpgrade } from "./fix-happy-dom";

export async function preRender(rawHTML: string, baseDir: string): Promise<string> {
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

  window.document.write(rawHTML);

  await window.happyDOM.waitUntilComplete();

  // Dump Happy DOM's private error & log history
  // const happyConsoleOutput = (window.happyDOM as any).virtualConsolePrinter?.readAsString();
  // if (happyConsoleOutput) {
  //   console.log("\n--- HEADLESS BROWSER CONSOLE LOGS ---");
  //   console.log(happyConsoleOutput);
  //   console.log("----------------------------------------\n");
  // }

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

// export function setupSSRSandbox(window: DOMWindow) {
//   // Catch browser-only feature holes gracefully without stopping the script execution
//   const browserOnlyGate = (apiName: string) => new Proxy({}, {
//     get(_, prop) {
//       throw new Error(`Browser API "${apiName}.${String(prop)}" is not available during pre-rendering.`);
//     }
//   });

//   // window.localStorage = browserOnlyGate('localStorage');
//   // window.sessionStorage = browserOnlyGate('sessionStorage');
  
//   // // Fake safe dimensions for canvas/layout calculations
//   // window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
// }


// Run if called from command line
runCLI()