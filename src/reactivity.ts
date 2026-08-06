import { render } from "lit-html";
import { ComponentRenderFn } from "./component";

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
  onDispose?: (cachedValue: T) => void;
}
export class ReactivityController {
  private _props: Record<string, any> = {};
  private _definedProps = new Set<string>();
  public hooksCache: HooksCacheRecord<any>[] = []
  public proxy: any;

  constructor(private host: HTMLElement, private renderFn: ComponentRenderFn) {
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

    // 2. Synchronize any attributes already in HTML at boot time
    this.syncAttributesToProps();

    // 3. Intercept native attribute modifications
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
    if (!this.host.shadowRoot) return;

    // Lock the runtime focus onto this specific element instance
    runtime.currentController = this;
    runtime.currentHookIndex = 0;

    try {
      const template = this.renderFn(this.proxy, this.host);
      render(template, this.host.shadowRoot);
    } finally {
      // Always clean up runtime focus, even if a rendering error throws
      runtime.currentController = null;
      runtime.currentHookIndex = 0;
    }  
  }

  private syncAttributesToProps(): void {
    for (const attr of this.host.attributes) {
      const camelName = toCamelCase(attr.name);
      console.log(`replaced ${attr.name} with ${camelName}`)
      this._props[camelName] = coerceValue(attr.value);
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
