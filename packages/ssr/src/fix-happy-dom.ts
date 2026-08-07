import type { Window } from 'happy-dom';

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
          Object.defineProperty(this, key, descriptor);
        }
        replayObservedAttributes(this);
      }
      originalConnected?.call(this);
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