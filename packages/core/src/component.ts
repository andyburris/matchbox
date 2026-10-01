import { html, nothing, TemplateResult } from 'lit-html';
import { type DirectiveResult } from 'lit-html/directive.js';
import { activeMatchboxOptions } from './config';
import { DefaultsFor, PropDef, readDefaults } from './props';
import { ReactivityController } from './reactivity';
import { Disposable } from "./remember";

export type ComponentRenderFn = (...args: any[]) => TemplateResult;
export interface ComponentOptions { adoptedStyleSheets?: CSSStyleSheet[], shadowRootMode?: ShadowRootMode, delegatesFocus?: boolean }

/** A function that mounts a registered component. */
export type RegisteredComponent<A extends any[], T extends string> =
  ((...args: A) => HostElementTemplate) & { readonly tagName: T };

/** A function that mounts an anonymous component, which can also be registered as a custom element. */
export type ComponentDef<A extends any[]> = ((...args: A) => HostElementTemplate) & {
  /** Adds this component to the custom element registry as `tagName`, and returns a function
   *  that renders it with its arguments bound as attributes or properties. */
  register<T extends `${string}-${string}`>(tagName: T, ...defaults: DefaultsArgs<A>): RegisteredComponent<A, T>;
};

/* ANONYMOUS */

export function component<A extends any[]>(
  render: (...args: A) => TemplateResult,
  options: ComponentOptions = {}
): ComponentDef<A> {
  const mount = mountFn(ensureAnonymousComponentTag, [".mb"], (args) => [
    { render, options, args } satisfies MountPayload
  ]);

  return Object.assign(mount, {
    register<T extends `${string}-${string}`>(tagName: T, defaults?: readonly Record<string, unknown>[]) {
      const props = defineComponent(tagName, render as ComponentRenderFn, options, defaults ?? []);
      const bindings = props.map(bindingFor);

      const mounted = mountFn(() => tagName, bindings, (args) =>
        props.map((prop, index) => {
          if (args[index] !== undefined) return args[index];
          // Removing an attribute falls back to the default; a property has to be given it
          return prop.usesAttribute ? nothing : prop.value;
        })
      );

      return Object.assign(mounted, { tagName });
    }
  }) as ComponentDef<A>;
}

/** The information necessary to populate an AnonymousMatchboxComponent */
type MountPayload = {
  readonly render: ComponentRenderFn;
  readonly options: ComponentOptions;
  readonly args: readonly unknown[];
};

export type HostElementProps = Record<string, unknown> & {
  /* Applies a list of Lit directives (e.g. MyEvent.listen(...)) to this host element */
  $directives?: readonly DirectiveResult[];
};
export type HostElementTemplate = TemplateResult & {
  with(host: HostElementProps, children?: unknown): TemplateResult;
};


function sameArgs(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

class AnonymousMatchboxComponent extends HTMLElement {
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
    if (this._controller) disposeController(this._controller);
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

// The tag for anonymous components. Resolved lazily so configureMatchbox() has a chance to rename the element first
let anonymousComponentTag: string | null = null;
function ensureAnonymousComponentTag(): string {
  if (anonymousComponentTag) return anonymousComponentTag;

  anonymousComponentTag = activeMatchboxOptions.componentTag;
  if (!customElements.get(anonymousComponentTag)) customElements.define(anonymousComponentTag, AnonymousMatchboxComponent);
  return anonymousComponentTag;
}

function bindingFor(prop: PropDef): string {
  if (!prop.usesAttribute) return `.${prop.name}`;
  return typeof prop.value === "boolean" 
    ? `?${prop.attributeName}` // for booleans, remove the attribute when false rather than setting "false"
    : prop.attributeName;
}

/** A binding with no name, which Lit turns into an ElementPart for a directive to attach to. */
const ELEMENT_BINDING = "";

/** Checks that each binding is valid attribute HTML, and won't close the tag and inject markup. */
const BINDING_NAME_VALIDATOR = /^[.?@]?[a-zA-Z][a-zA-Z0-9-]*$/;

const elementTemplates = new Map<string, TemplateStringsArray>();

/** Builds `<tag name=${} ...>${children}</tag>` for Lit to fill. */
function elementTemplate(tag: string, names: readonly string[], withChildren: boolean): TemplateStringsArray {
  const cacheKey = `${tag} ${withChildren} ${names.join(" ")}`;
  const cached = elementTemplates.get(cacheKey);
  if (cached) return cached;

  const named = names.filter((name) => name !== ELEMENT_BINDING);

  // Check that there are no duplicate attributes--the HTML parser would drop one and thus desync every part after it
  if (new Set(named).size !== named.length) {
    throw new Error(`[matchbox] <${tag}> was given the same attribute twice: ${named.join(" ")}`);
  }

  // Only a new shape reaches this point, so validating here covers every name exactly once
  for (const name of named) {
    if (!BINDING_NAME_VALIDATOR.test(name)) throw new Error(`[matchbox] "${name}" is not a valid attribute or property name`);
  }

  const parts = names.map((name, index) => `${index === 0 ? `<${tag} ` : " "}${name === ELEMENT_BINDING ? "" : `${name}=`}`);
  parts.push(names.length === 0 ? `<${tag}>` : ">");
  if (withChildren) parts.push(`</${tag}>`);
  else parts[parts.length - 1] += `</${tag}>`;

  const strings = Object.assign(parts, { raw: parts }) as unknown as TemplateStringsArray;
  elementTemplates.set(cacheKey, strings);
  return strings;
}

/** Creates a function that produces a host element to be used inside a ${} in a Lit template */
function mountFn<A extends any[]>(
  getTag: () => string,
  bindings: readonly string[],
  getValues: (args: readonly unknown[]) => readonly unknown[]
): (...args: A) => HostElementTemplate {
  return (...args: A) => {
    const tag = getTag();
    const values = getValues(args);

    const result = html(elementTemplate(tag, bindings, false), ...values) as HostElementTemplate;

    result.with = ({ $directives = [], ...attributes }, children) => {
      // Sorted so the order of the keys can't change template identity between renders.
      const keys = Object.keys(attributes).sort();
      return html(
        elementTemplate(tag, [...keys, ...$directives.map(() => ELEMENT_BINDING), ...bindings], true),
        ...keys.map((key) => attributes[key]),
        ...$directives,
        ...values,
        children ?? nothing
      );
    };

    return result;
  };
}

/* REGISTER */
type DefaultsArgs<A extends any[]> = A extends []
  ? [defaults?: DefaultsFor<[]>] // A component with no parameters has nothing to declare defaults for.
  : [defaults: DefaultsFor<A>];

function defineComponent(
  tagName: string,
  renderFn: ComponentRenderFn,
  options: ComponentOptions,
  defaults: readonly Record<string, unknown>[]
): PropDef[] {
  const props = readDefaults(defaults);

  class MinimalReactiveElement extends HTMLElement {
    static observedAttributes = props.filter((p) => p.usesAttribute).map((p) => p.attributeName);
    private _controller: ReactivityController;

    constructor() {
      super();
      const root = attachRoot(this, options);

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
      disposeController(this._controller);
    }

    mountNow(): void {
      if (this.isConnected && !this._controller.isMounted) {
        firstRender(this._controller);
      }
    }
  }

  customElements.define(tagName, MinimalReactiveElement);
  return props;
}

/* COMMON */
type Mountable = HTMLElement & { mountNow(): void };
const pendingMounts: Mountable[] = [];
let flushing = false;

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

// queue the first render until all the Matchbox elements are finished mounting
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


function disposeController(controller: ReactivityController): void {
  // Run dispose on unmount for any hook that needs it
  for (const record of controller.hooksCache) {
    const value = record.value as Record<symbol, unknown> | null;
    if (value && typeof value[Disposable] === 'function') (value[Disposable] as () => void)();
  }
  controller.untrackAll();
}