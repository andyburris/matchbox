import { Plugin, IndexHtmlTransformContext } from 'vite';
import { preRender } from './prerender';
import * as path from "path"

export function matchboxPreRenderPlugin(): Plugin {
  return {
    name: 'vite-plugin-matchbox-prerender',
    
    // This hook executes at the end of 'vite build' using completely compiled distribution assets
    async transformIndexHtml(html: string, ctx: IndexHtmlTransformContext) {
      console.log('[Vite Matchbox SSR Plugin] Executing build-time custom elements compilation pass...');
      try {
        // Automatically injects DSD and passes it straight out to Vite's final writer stream
        return await preRender(html, path.dirname(ctx.filename));
      } catch (err: any) {
        console.error('[Vite Matchbox SSR Plugin Error] Fallback triggered. Outputting standard client html node framework.', err.message);
        return html; // Fallback safely to raw client HTML if parsing fails
      }
    }
  };
}
