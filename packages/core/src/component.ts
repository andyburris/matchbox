import { html, nothing, TemplateResult } from 'lit-html';
import type { DirectiveResult } from 'lit-html/directive.js';
import { activeMatchboxOptions } from './config';
import { DefaultsFor, readDefaults } from './props';
import { ReactivityController } from './reactivity';
import { Disposable } from "./remember";

export type ComponentRenderFn = (...args: any[]) => TemplateResult;

export interface ComponentOptions { adoptedStyleSheets?: CSSStyleSheet[], shadowRootMode?: ShadowRootMode, delegatesFocus?: boolean }
export type RegisterOptions<A extends any[]> = ComponentOptions & { defaults: DefaultsFor<A> };
/** A component with no parameters has nothing to declare defaults for, so both 
 * the options object and the defaults inside it become optional. */
type OptionsArgs<A extends any[]> = A extends []
  ? [options?: Partial<RegisterOptions<[]>>]
  : [options: RegisterOptions<A>];

type Mountable = HTMLElement & { mountNow(): void };
const pendingMounts: Mountable[] = [];
let flushing = false;

/* COMMON */
function attachRoot(host: HTMLElement, options: ComponentOptions): ShadowRoot {
  const root = host.shadowRoot ?? host.attachShadow({ mode: options.shadowRootMode ?? 'open', delegatesFocus: options.delegatesFocus ?? false });
  root.adoptedStyleSheets = options.adoptedStyleSheets ?? activeMatchboxOptions.defaultAdoptedStylesheets;
  return root;
}

function firstRender(controller: ReactivityController): void {
  controller.isMounted = true;

  // Prerendered DOM is already what the first render would produce, so bind Lit's parts to it rather than rebuilding it. 
  // If hydration fails, we can just render normally (hydration only touches nodes it has already committed to keeping).
  if (controller.root.firstChild) {
    if (controller.performHydrate()) {
      controller.root.querySelectorAll('[data-mb-style]').forEach((node) => node.remove());
      return;
    }
    console.warn(`[matchbox] <${controller.root.host.localName}> couldn't hydrate. Re-rendering the entire component, but any user interaction before JS loaded will be discarded`, controller.root.host);
  }

  controller.root.replaceChildren();
  controller.performUpdate();
}

function parentOf(node: Node): Node | null {
  return node.parentNode ?? (node as Partial<ShadowRoot>).host ?? null;
}

/** Get the depth of an element in the document (memoized), passing through shadow boundaries. */
function shadowDepth(element: Element, known: Map<Node, number>): number {
  const chain: Node[] = [];
  let node: Node | null = element;
  let depth = -1;

  while (node) {
    const cached = known.get(node);
    if (cached !== undefined) {
      depth = cached;
      break;
    }
    chain.push(node);
    node = parentOf(node);
  }

  // Fill in everything we walked past, from the highest ancestor back down
  for (let i = chain.length - 1; i >= 0; i--) {
    known.set(chain[i], ++depth);
  }

  return depth;
}

// queue the first render until 
function queueFirstRender(element: Mountable): void {
  pendingMounts.push(element);

  // if this is the first time any matchbox component has rendered, kick off the flushing task
  if (flushing || pendingMounts.length > 1) return;
  flushing = true;
  queueMicrotask(flushMounts);
}

function flushMounts(): void {
  try {
    // Rendering a parent connects its children, which queue during this loop
    while (pendingMounts.length > 0) {
      const batch = pendingMounts.splice(0);

      if (batch.length > 1) {
        const depths = new Map<Node, number>();
        for (const element of batch) shadowDepth(element, depths);
        batch.sort((a, b) => depths.get(a)! - depths.get(b)!);
      }

      for (const element of batch) {
        // One component throwing shouldn't stop the rest of the batch from mounting
        try {
          element.mountNow();
        } catch (error) {
          console.error(`[matchbox] <${element.localName}> threw during its first render`, element, error);
        }
      }
    }
  } finally {
    flushing = false;
  }
}


function disposeHooks(controller: ReactivityController): void {
  // Run dispose on unmount for any hook that needs it
  for (const record of controller.hooksCache) {
    const value = record.value as Record<symbol, unknown> | null;
    if (value && typeof value[Disposable] === 'function') (value[Disposable] as () => void)();
  }
}

/* REGISTERED */

/** Blocks inference from the options argument, so the parameters alone decide the types. */
type NoInferA<T> = [T][T extends any ? 0 : never];

/** Options a definition already carries can be partly overridden; a plain render fn needs the full set. */
type SourceOptionsArgs<A extends any[], S> =
  S extends UnregisteredComponentDef<A, true> ? [options?: Partial<RegisterOptions<A>>] : OptionsArgs<A>;

export function registerComponent<A extends any[], S>(
  tagName: `${string}-${string}`,
  source: S & ((...args: A) => TemplateResult),
  ...rest: SourceOptionsArgs<NoInferA<A>, S>
): void {
  const definition = (source as Partial<UnregisteredComponentDef<any[], boolean>>)[DEF];
  const renderFn = definition?.render ?? (source as ComponentRenderFn);
  const options = rest[0] as (ComponentOptions & { defaults?: readonly Record<string, unknown>[] }) | undefined;

  // Registration options win over the definition's own, so a component library can ship
  // defaults and styling that the consumer is still free to adjust when they name the tag.
  const settings: ComponentOptions & { defaults?: readonly Record<string, unknown>[] } =
    { ...definition?.options, ...options };

  const props = readDefaults(settings.defaults ?? []);

  class MinimalReactiveElement extends HTMLElement {
    static observedAttributes = props.filter((p) => p.usesAttribute).map((p) => p.attributeName);
    private _controller: ReactivityController;

    constructor() {
      super();
      const root = attachRoot(this, settings);

      // Initialize the core controller layer
      this._controller = new ReactivityController(this, root, renderFn, props);
    }

    attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
      this._controller.handleAttributeChange(name, value);
    }


    connectedCallback(): void {
      if (this._controller.isMounted) {
        this._controller.performUpdate();
      } else {
        queueFirstRender(this);
      }
    }

    disconnectedCallback() {
      disposeHooks(this._controller);
    }

    mountNow(): void {
      if (this.isConnected && !this._controller.isMounted) {
        firstRender(this._controller);
      }
    }
  }

  customElements.define(tagName, MinimalReactiveElement);
}

/* UNREGISTERED */

/** The information necessary to populate an anonymous UnregisteredMatchboxComponent */
type MountPayload = {
  readonly render: ComponentRenderFn;
  readonly options: ComponentOptions;
  readonly args: readonly unknown[];
};

export type UnregisteredHostProps = {
  class?: string | DirectiveResult;
  style?: string | DirectiveResult;
  id?: string;
  slot?: string;
  children?: unknown;
};

export type MountedUnregisteredTemplate = TemplateResult & {
  with(host: UnregisteredHostProps): TemplateResult;
};


function sameArgs(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

class UnregisteredMatchboxComponent extends HTMLElement {
  private _controller: ReactivityController | null = null;
  private _payload: MountPayload | null = null;

  set mb(payload: MountPayload) {
    const previous = this._payload;
    this._payload = payload;

    if (!this._controller) {
      this.tryMount();
    } else if (!previous || previous.render !== payload.render || !sameArgs(previous.args, payload.args)) {
      // The payload object is new on every parent render, so compare what's inside it
      this._controller.performUpdate();
    }
  }

  get mb(): MountPayload | null {
    return this._payload;
  }

  connectedCallback(): void {
    // A parent may have committed `.mb` before this element was defined, 
    // leaving an own property that shadows the prototype setter.
    const own = this as unknown as { mb?: MountPayload };
    if (Object.prototype.hasOwnProperty.call(this, 'mb')) {
      const pending = own.mb;
      delete own.mb;
      if (pending) this.mb = pending;
    }

    if (this._controller) {
      this._controller.performUpdate();
      return;
    }

    this.tryMount();
  }

  disconnectedCallback(): void {
    if (this._controller) disposeHooks(this._controller);
  }

  /** Only mount once connected and the payload has arrived (which can happen in either order) */
  private tryMount(): void {
    if (this._controller || !this.isConnected || !this._payload) return;

    const { render, options } = this._payload;
    const root = attachRoot(this, options);

    this._controller = new ReactivityController(this, root, render, () => this._payload!.args);
    queueFirstRender(this);
  }

  mountNow(): void {
    if (this.isConnected && this._controller && !this._controller.isMounted) {
      firstRender(this._controller);
    }
  }
}


// The string templates for mb-component Lit will fill
// One for the simple <mb-component .mb=${}> and one for the full set of attributes
// Start as null and set with ensureMountTemplates() 
// to give configureMatchbox() time to run and possibly change the name of mb-component
type MountTemplates = { readonly bare: TemplateStringsArray; readonly withHost: TemplateStringsArray };
let mountTemplates: MountTemplates | null = null;
function ensureMountTemplates(): MountTemplates {
  if (mountTemplates) return mountTemplates;

  const tag = activeMatchboxOptions.componentTag;
  if (!customElements.get(tag)) customElements.define(tag, UnregisteredMatchboxComponent);

  mountTemplates = {
    bare: makeStrings([`<${tag} .mb=`, `></${tag}>`]),
    withHost: makeStrings([`<${tag} class=`, ` id=`, ` style=`, ` slot=`, ` .mb=`, `>`, `</${tag}>`]),
  };
  return mountTemplates;
}
function makeStrings(parts: string[]): TemplateStringsArray {
  return Object.assign(parts, { raw: parts }) as unknown as TemplateStringsArray;
}

const DEF = Symbol("matchbox.componentDef");

/** A function that generates an mb-component, with the information on how to render it attached. */
export type UnregisteredComponentDef<A extends any[], HasDefaults extends boolean> =
  ((...args: A) => MountedUnregisteredTemplate) & {
    readonly [DEF]: {
      readonly render: (...args: A) => TemplateResult;
      readonly options: HasDefaults extends true ? RegisterOptions<A> : ComponentOptions;
    };
  };

export function component<A extends any[]>(
  render: (...args: A) => TemplateResult,
  options: RegisterOptions<A>
): UnregisteredComponentDef<A, true>;
export function component<A extends any[]>(
  render: (...args: A) => TemplateResult,
  options?: ComponentOptions
): UnregisteredComponentDef<A, false>;
export function component<A extends any[]>(
  render: (...args: A) => TemplateResult,
  options: ComponentOptions & { defaults?: readonly Record<string, unknown>[] } = {}
): UnregisteredComponentDef<A, boolean> {
  const mount = (...args: A): MountedUnregisteredTemplate => {
    const result = html(
      ensureMountTemplates().bare,
      { render, options, args } satisfies MountPayload
    ) as MountedUnregisteredTemplate;

    result.with = withHost;
    return result;
  };

  return Object.assign(mount, { [DEF]: { render, options } }) as UnregisteredComponentDef<A, boolean>;
}

function withHost(this: TemplateResult, host: UnregisteredHostProps): TemplateResult {
  return html(
    ensureMountTemplates().withHost,
    host.class ?? nothing,
    host.id ?? nothing,
    host.style ?? nothing,
    host.slot ?? nothing,
    this.values[0], // the payload from the bare template
    host.children ?? nothing
  );
}