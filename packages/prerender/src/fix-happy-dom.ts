import { type Window, HTMLSerializer } from 'happy-dom';

const MARKER = 'data-matchbox-upgrade';

/**
 * happy-dom upgrades a custom element by constructing a new element and splicing it
 * into the parent in place of the old node (see HTMLElement #onCustomElementConnected).
 * Attributes survive that swap; JS properties set on the old node do not. This restores
 * them just before the element's own connectedCallback, which is where they get read.
 */
export function patchCustomElementUpgrade(window: Window): void {
  const registry = window.customElements;
  const originalDefine = registry.define.bind(registry);
  const pending = new Map<string, Record<string, PropertyDescriptor>>();
  let nextId = 0;

  registry.define = (name, elementClass, options) => {
    for (const stale of deepQueryTag(window.document as any, name)) {
      const descriptors: Record<string, PropertyDescriptor> = {};
      // Everything happy-dom keeps on an element instance is symbol-keyed,
      // so any string-named own property came from user code.
      for (const key of Object.getOwnPropertyNames(stale)) {
        descriptors[key] = Object.getOwnPropertyDescriptor(stale, key)!;
      }
      const id = String(nextId++);
      pending.set(id, descriptors);
      stale.setAttribute(MARKER, id);
    }

    const originalConnected = elementClass.prototype.connectedCallback;
    elementClass.prototype.connectedCallback = function (this: HTMLElement) {
      const id = this.getAttribute(MARKER);
      if (id !== null) {
        const descriptors = pending.get(id);
        pending.delete(id);
        this.removeAttribute(MARKER);
        for (const [key, descriptor] of Object.entries(descriptors ?? {})) {
          // The new element's constructor has already installed accessors for its props.
          // defineProperty would shadow them with a plain value the component never reads,
          // so assign instead and let the setter do its job.
          if ("value" in descriptor && descriptor.writable !== false) {
            (this as unknown as Record<string, unknown>)[key] = descriptor.value;
          } else {
            Object.defineProperty(this, key, descriptor);
          }
        }
        replayObservedAttributes(this);
      }

      try {
        originalConnected?.call(this);
      } catch (error) {
        // A component that can't prerender leaves a partial shadow root behind;
        // drop it so the client renders this one from scratch.
        // If happy-dom fixes the properties issue, we still need to keep this logic.
        this.shadowRoot?.replaceChildren();
        console.warn(`[matchbox] skipped prerendering <${name}>:`, (error as Error).message);
      }

    };

    originalDefine(name, elementClass, options);
  };
}

/**
 * The swap writes attributes straight into the new node's attribute map, so
 * attributeChangedCallback never fires for them. Matchbox doesn't use it, but
 * third-party components (Lit, etc.) get all their props through it.
 */
function replayObservedAttributes(element: HTMLElement): void {
  const observed = (element.constructor as any).observedAttributes;
  const callback = (element as any).attributeChangedCallback;
  if (!Array.isArray(observed) || typeof callback !== 'function') return;
  for (const name of observed) {
    const value = element.getAttribute(name);
    if (value !== null) callback.call(element, name, null, value);
  }
}

function deepQueryTag(root: ParentNode, tagName: string, found: Element[] = []): Element[] {
  for (const element of root.querySelectorAll('*')) {
    if (element.localName === tagName) found.push(element);
    if (element.shadowRoot) deepQueryTag(element.shadowRoot, tagName, found);
  }
  return found;
}

/**
 * happy-dom's CSS parser drops @layer, @property, and nesting, so a sheet's cssRules
 * can't be trusted to reproduce it. Record what was handed to the sheet instead.
 */
export const RAW_CSS = Symbol.for('matchbox.rawCSS');

export function captureStyleSheetSources(window: Window): void {
  const prototype = window.CSSStyleSheet.prototype;

  const originalReplaceSync = prototype.replaceSync;
  prototype.replaceSync = function (text) {
    (this as any)[RAW_CSS] = text;
    return originalReplaceSync.call(this, text);
  };

  const originalReplace = prototype.replace;
  prototype.replace = function (text) {
    (this as any)[RAW_CSS] = text;
    return originalReplace.call(this, text);
  };
}

/**
 * happy-dom loses delegatesFocus in both directions: attachShadow reads `init.delegateFocus`
 * where the spec property is `delegatesFocus`, and the serializer never writes the matching
 * `shadowrootdelegatesfocus` attribute. Without both halves a prerendered component silently
 * loses focus delegation, while the same component rendered on the client keeps it.
 */
let serializerPatched = false;

export function patchDelegatesFocus(window: Window): void {
  const elementPrototype = window.Element.prototype as unknown as {
    attachShadow(init: ShadowRootInit): ShadowRoot;
  };
  const originalAttachShadow = elementPrototype.attachShadow;
  elementPrototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
    // Hand happy-dom the misspelled key it actually reads, alongside the correct one
    const fixed = init?.delegatesFocus ? { ...init, delegateFocus: true } : init;
    return originalAttachShadow.call(this, fixed as ShadowRootInit);
  };

  // The serializer is a module-level class rather than a per-window one, so patch it once
  if (serializerPatched) return;
  serializerPatched = true;

  const serializerPrototype = HTMLSerializer.prototype as unknown as {
    serializeToString(root: unknown): string;
  };
  const originalSerialize = serializerPrototype.serializeToString;
  serializerPrototype.serializeToString = function (root: unknown): string {
    const html = originalSerialize.call(this, root);
    if (!(root as Partial<Element>)?.shadowRoot?.delegatesFocus) return html;
    // An element's own shadow template is written before any of its children, so the first
    // match in its own output is always its own root and never a nested component's.
    return html.replace('<template shadowrootmode=', '<template shadowrootdelegatesfocus="" shadowrootmode=');
  };
}
