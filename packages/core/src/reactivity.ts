import { render, type TemplateResult } from "lit-html";
import { ComponentRenderFn } from "./component";
import { activeMatchboxOptions } from "./config";
import { PropDef } from "./props";

export const runtime = {
  currentController: null as (ReactivityController | null),
  currentHookIndex: 0
};

export type HooksCacheRecord<T> = {
  keys: any[],
  value: T,
}
export class ReactivityController {
  private _props: Record<string, unknown> = {};
  private _propsByAttribute = new Map<string, PropDef>();
  private renderArgs: () => readonly unknown[];

  public hooksCache: HooksCacheRecord<any>[] = [];
  /* Flag to make sure we only render when the component is hydrated, even when attributes are changed beforehand. */
  public isMounted = false;

  constructor(host: HTMLElement, root: ShadowRoot, renderFn: ComponentRenderFn, propDefs: PropDef[]);
  constructor(host: HTMLElement, root: ShadowRoot, renderFn: ComponentRenderFn, renderArgs: () => readonly unknown[]);
  constructor(
    public host: HTMLElement,
    public root: ShadowRoot,
    private renderFn: ComponentRenderFn,
    renderArgsSource: PropDef[] | (() => readonly unknown[])
  ) {
    // There are no attributes for unregistered components
    if (!Array.isArray(renderArgsSource)) {
      this.renderArgs = renderArgsSource;
      return;
    }

    const propDefs = renderArgsSource;
    this.renderArgs = () => propDefs.map((p) => this._props[p.name]);
    for (const prop of propDefs) {
      this._props[prop.name] = prop.value;
      if (prop.usesAttribute) this._propsByAttribute.set(prop.attributeName, prop);
      this.defineProp(prop.name);
    }
  }

  public performUpdate(): void {
    this.withRuntime((template, root) => render(template, root));
  }

  public handleAttributeChange(attributeName: string, value: string | null): void {
    const prop = this._propsByAttribute.get(attributeName);
    if (!prop) return;

    const coerced = coerceAttribute(value, prop.value);
    if (this._props[prop.name] === coerced) return;

    this._props[prop.name] = coerced;
    this.performUpdate();
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
    if (!this.isMounted || !this.host.isConnected) return;

    const previousController = runtime.currentController;
    const previousHookIndex = runtime.currentHookIndex;

    // Lock the runtime focus onto this specific element instance
    runtime.currentController = this;
    runtime.currentHookIndex = 0;

    try {
      return commit(this.renderFn(...this.renderArgs()), this.root);
    } finally {
      // Always restore runtime focus, even if a rendering error throws
      runtime.currentHookIndex = previousHookIndex;
      runtime.currentController = previousController;
    }
  }

  /** Routes reads and writes of this prop on the element through _props, re-rendering on write. */
  private defineProp(name: string): void {
    const host = this.host as unknown as Record<string, unknown>;

    // A parent may have set this before the element upgraded, leaving an own property
    // that would otherwise shadow the accessor
    if (Object.prototype.hasOwnProperty.call(host, name)) {
      this._props[name] = host[name];
      delete host[name];
    }

    Object.defineProperty(host, name, {
      get: () => this._props[name],
      set: (value: unknown) => {
        if (this._props[name] === value) return;
        this._props[name] = value;
        this.performUpdate();
      },
      configurable: true,
      enumerable: true
    });
  }

}

/** Attributes are always strings, so the declared default supplies the type to convert to. */
function coerceAttribute(raw: string | null, fallback: unknown): unknown {
  if (raw === null) return fallback;
  switch (typeof fallback) {
    case "boolean": return raw !== "false"; // True if present and not the string "false"
    case "number": return Number(raw);
    default: return raw;
  }
}