import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { RAW_CSS } from './fix-happy-dom.js';
import { collectShadowRoots } from "./dom.js";

/** Adopted stylesheets are a JS construct, so they don't survive serialization. Reference
 *  them by <link> where the document already ships the same CSS, and inline the rest. */
export async function inlineAdoptedStyleSheets(
  document: Document,
  baseDir: string,
  { inlineWarning = 50_000, inlineLimit = 100 }: { inlineWarning?: number, inlineLimit?: number } = {}
): Promise<void> {
  const roots = collectShadowRoots(document);
  if (roots.length === 0) return;

  const hrefByContent = await collectLinkedStyleSheets(document, baseDir);
  const hrefBySheet = new Map<CSSStyleSheet, string | undefined>();
  const rootsBySheet = new Map<CSSStyleSheet, number>();

  for (const root of roots) {
    for (const sheet of root.adoptedStyleSheets) {
      rootsBySheet.set(sheet, (rootsBySheet.get(sheet) ?? 0) + 1);
    }
  }

  for (const [sheet, count] of rootsBySheet) {
    const css: string | undefined = (sheet as any)[RAW_CSS];
    if (css === undefined) continue;   // built with insertRule — no trustworthy source text

    const totalBytes = css.length * count;
    const href = totalBytes > inlineLimit 
        ? hrefByContent.get(normalizeCSS(css)) 
        : undefined;
    
    hrefBySheet.set(sheet, href);
    if (!href && totalBytes > inlineWarning) {
      console.warn(
        `[matchbox] inlining ${(css.length / 1024).toFixed(1)}KB of CSS into ${count} shadow root(s) ` +
        `(~${(totalBytes / 1024).toFixed(0)}KB added to the HTML). Link this stylesheet from your ` +
        `HTML so it can be referenced instead of duplicated.`
      );
    }
  }

  for (const root of roots) {
    const nodes = root.adoptedStyleSheets.flatMap((sheet) => {
      const css: string | undefined = (sheet as any)[RAW_CSS];
      if (css === undefined) return [];

      const href = hrefBySheet.get(sheet);
      if (href) {
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', href);
        link.setAttribute('data-mb-style', '');
        return [link];
      }

      const style = document.createElement('style');
      style.setAttribute('data-mb-style', '');
      style.textContent = css;
      return [style];
    });

    root.prepend(...nodes);   // ordered, so the cascade matches adoptedStyleSheets
  }
}

const normalizeCSS = (css: string) => css.replace(/\s+/g, ' ').trim();

/** Maps the content of every stylesheet the document already links to its href. */
async function collectLinkedStyleSheets(document: Document, baseDir: string): Promise<Map<string, string>> {
  const hrefByContent = new Map<string, string>();

  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')) {
    const url = new URL(link.href);
    if (url.origin !== document.location.origin) continue;   // CDN — nothing to compare against

    try {
      // pathname drops any ?v= query and maps onto baseDir exactly like the virtual server
      const css = await fs.readFile(path.join(baseDir, url.pathname), 'utf-8');
      hrefByContent.set(normalizeCSS(css), link.getAttribute('href')!);
    } catch {
      // not on disk — falls through to inlining
    }
  }

  return hrefByContent;
}