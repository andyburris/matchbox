import { render, type TemplateResult } from "lit-html";
import { ComponentRenderFn } from "./component";
import { activeMatchboxOptions } from "./config";

export interface HookState {
  value: any;
  keys: any[];
}

export const runtime = {
  currentController: null as (ReactivityController | null),
  currentHookIndex: 0
};

export type HooksCacheRecord<T> = {
  keys: any[],
  value: T,
}
export class ReactivityController {
  private _props: Record<string, any> = {};
  private _definedProps = new Set<string>();
  public hooksCache: HooksCacheRecord<any>[] = []
  public proxy: any;
  public isConnectedToDOM: boolean = false;
  private _hasSyncedAttributes = false;

  constructor(public host: HTMLElement, private renderFn: ComponentRenderFn) {
    // 1. Initialize proxy to watch property reads during rendering
    this.proxy = new Proxy(this._props, {
      get: (target, key) => {
        if (typeof key === 'string') {
          this.ensureReactiveProperty(key);
          return target[key];
        }
        return Reflect.get(target, key);
      }
    });

    // 2. Intercept native attribute modifications
    const originalSetAttr = host.setAttribute.bind(host);
    host.setAttribute = (name: string, value: string) => {
      originalSetAttr(name, value);
      this.handleAttributeChange(name, value);
    };

    const originalRemoveAttr = host.removeAttribute.bind(host);
    host.removeAttribute = (name: string) => {
      originalRemoveAttr(name);
      this.handleAttributeChange(name, null);
    };
  }

  public performUpdate(): void {
    this.withRuntime((template, root) => render(template, root));
  }

  /** 
   * Returns whether the hydration succeeded. 
   * If not, the component needs to clear and render normally. */
  public performHydrate(): boolean {
    const hydrate = activeMatchboxOptions.hydrate;
    if (hydrate === null) return false;

    return this.withRuntime((template, root) => {
      try {
        const hydrated = hydrate(template, root);
        // console.log("[matchbox] hydration succeeded");
        return hydrated;
      } catch (error) {
        // Every private lit name hydration touches is renamed in production builds, so a
        // version whose shape we don't recognise must degrade to a render, not a blank page.
        console.error(`[matchbox] <${this.host.localName}> threw while hydrating, rendering instead`, this.host, error);
        return false;
      }
    }) ?? false;
  }

  private withRuntime<T>(commit: (template: TemplateResult, root: ShadowRoot) => T): T | undefined {
    const root = this.host.shadowRoot;
    if (!this.isConnectedToDOM || !root) return;

    // Lock the runtime focus onto this specific element instance
    runtime.currentController = this;
    runtime.currentHookIndex = 0;

    try {
      return commit(this.renderFn(this.proxy, this.host), root);
    } finally {
      // Always clean up runtime focus, even if a rendering error throws
      runtime.currentController = null;
      runtime.currentHookIndex = 0;
    }
  }


  public syncAttributesToProps(): void {
    if (this._hasSyncedAttributes) return;
    this._hasSyncedAttributes = true;
    for (const attr of this.host.attributes) {
      this._props[toCamelCase(attr.name)] = coerceValue(attr.value);
    }
  }

  private handleAttributeChange(name: string, value: string | null): void {
    const camelName = toCamelCase(name);
    const coerced = coerceValue(value);
    if (this._props[camelName] !== coerced) {
      this._props[camelName] = coerced;
      this.performUpdate();
    }
  }

  private ensureReactiveProperty(key: string): void {
    if (this._definedProps.has(key)) return;
    this._definedProps.add(key);

    // Upgrade pre-existing properties already set on the element instance
    if (Object.prototype.hasOwnProperty.call(this.host, key)) {
      const value = (this.host as any)[key];
      delete (this.host as any)[key];
      this._props[key] = value;
    }

    Object.defineProperty(this.host, key, {
      get: () => this._props[key],
      set: (val: any) => {
        if (this._props[key] !== val) {
          this._props[key] = val;
          this.performUpdate();
        }
      },
      configurable: true,
      enumerable: true
    });
  }
}

function toCamelCase(kebabCaseName: string): string {
  return kebabCaseName.replace(/-([a-z])/g, (g) => g.slice(1).toUpperCase());
}

function coerceValue(val: string | null): any {
  if (val === null) return undefined;
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (!isNaN(Number(val)) && val.toString().trim() !== '') return Number(val);
  return val.toString();
}
