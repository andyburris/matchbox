import { TemplateResult } from 'lit-html';
import { ReactivityController } from './reactivity';

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
        this.shadowRoot.adoptedStyleSheets = options.adoptedStyleSheets ?? []; // TODO: add global style sheet config
      }

      // Initialize the core controller layer
      this._controller = new ReactivityController(this, renderFn);
    }

    connectedCallback(): void {
      this._controller.performUpdate();
    }
  }

  customElements.define(tagName, MinimalReactiveElement);
}