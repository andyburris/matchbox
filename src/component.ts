import { TemplateResult } from 'lit-html';
import { ReactivityController } from './reactivity';
import { activeMatchboxOptions } from './config';

export type ComponentRenderFn = (props: any, host: HTMLElement) => TemplateResult;

export interface ComponentOptions {
  adoptedStyleSheets?: CSSStyleSheet[];
}

export function component(
  tagName: string,
  renderFn: ComponentRenderFn,
  options: ComponentOptions = {}
): void {
  class MinimalReactiveElement extends HTMLElement {
    private _controller!: ReactivityController;

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      if (this.shadowRoot) {
        this.shadowRoot.adoptedStyleSheets = options.adoptedStyleSheets ?? activeMatchboxOptions.defaultAdoptedStylesheets;
      }

      // Initialize the core controller layer
      this._controller = new ReactivityController(this, renderFn);
    }

    connectedCallback(): void {
      this._controller.performUpdate();
    }

    disconnectedCallback() {
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