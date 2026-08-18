import { TemplateResult } from 'lit-html';
import { activeMatchboxOptions } from './config';
import { ReactivityController } from './reactivity';

export type ComponentRenderFn = (props: any, host: HTMLElement) => TemplateResult;

export interface ComponentOptions {
  adoptedStyleSheets?: CSSStyleSheet[];
}

export function component(
  tagName: `${string}-${string}`,
  renderFn: ComponentRenderFn,
  options: ComponentOptions = {}
): void {
  class MinimalReactiveElement extends HTMLElement {
    private _controller!: ReactivityController;
    private _firstConnect = true;

    constructor() {
      super();
      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      root.adoptedStyleSheets = options.adoptedStyleSheets ?? activeMatchboxOptions.defaultAdoptedStylesheets;

      // Initialize the core controller layer
      this._controller = new ReactivityController(this, renderFn);
    }

    connectedCallback(): void {
      this._controller.isConnectedToDOM = true
      this._controller.syncAttributesToProps();

      if (!this._firstConnect) {
        this._controller.performUpdate();
      } else {
        this._firstConnect = false;

        const root = this.shadowRoot!;

        // Prerendered DOM is already what the first render would produce, 
        // so bind Lit's parts to it rather than rebuilding it. 
        // If hydration fails, we can just render normally (hydration only touches nodes it has already committed to keeping).
        if (root.firstChild) {
          const hydrateSucceeded = this._controller.performHydrate()
          if (hydrateSucceeded) {
            root.querySelectorAll('[data-mb-style]').forEach((node) => node.remove());
            return;
          } else {
            console.warn(`[matchbox] <${tagName}> couldn't hydrate. Re-rendering the entire component, but any user interaction before JS loaded will be discarded`, this)
          }
        }

        root.replaceChildren();
        this._controller.performUpdate();
      }
    }

    disconnectedCallback() {
      this._controller.isConnectedToDOM = false
      const cache = this._controller.hooksCache;
      if (cache) {
        // Run dispose on unmount for any hook that needs it
        cache.forEach((record: any) => {
          if (record && typeof record.onDispose === 'function') {
            record.onDispose(record.value);
          }
        });
      }
    }
  }

  customElements.define(tagName, MinimalReactiveElement);
}