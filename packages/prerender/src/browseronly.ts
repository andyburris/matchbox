import type { Window } from 'happy-dom';

const OPAQUE_NAMESPACES = ['localStorage', 'sessionStorage', 'indexedDB'] as const;
const CLIENT_PROPERTIES = ['innerWidth', 'innerHeight', 'devicePixelRatio', 'screen'] as const;
const INTL_CONSTRUCTORS = ['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'Collator'] as const;

/** 
 * Throw on any access to a client-only (or random) API, 
 * which marks that component as un-prerenderable. 
 */
export function gateBrowserOnlyAPIs(window: Window): void {
  const global = window as unknown as Record<string, unknown>;

  for (const name of OPAQUE_NAMESPACES) {
    define(global, name, new Proxy({}, { get: (_, key) => unavailable(`${name}.${String(key)}`) }));
  }
  define(global, 'matchMedia', () => unavailable('matchMedia'));

  for (const name of CLIENT_PROPERTIES) gateProperty(global, name);
  gateProperty(window.navigator as unknown as object, 'language');
  gateProperty(window.navigator as unknown as object, 'languages');
  gateProperty(window.document as unknown as object, 'cookie');

  gateLocaleMethods(window.Date.prototype, ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']);
  gateLocaleMethods(window.Number.prototype, ['toLocaleString']);
  for (const name of INTL_CONSTRUCTORS) gateIntl(window.Intl, name);
}

function unavailable(name: string): never {
  throw new Error(
    `${name} is not available during prerendering — its value depends on the visitor, so the ` +
    `prerendered HTML wouldn't match what the client renders.`
  );
}

function define(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
}

function gateProperty(target: object, name: string): void {
  Object.defineProperty(target, name, { configurable: true, get: () => unavailable(name) });
}

/** 
 * Only throws when the locale is left to the environment — `toLocaleDateString('en-US')`
 * is deterministic and safe to prerender.
 */
function gateLocaleMethods(prototype: object, names: readonly string[]): void {
  for (const name of names) {
    const original = (prototype as Record<string, (...args: unknown[]) => unknown>)[name];
    define(prototype, name, function (this: unknown, ...args: unknown[]) {
      if (args[0] === undefined) unavailable(`${name}()`);
      return original.apply(this, args);
    });
  }
}

function gateIntl(intl: typeof Intl, name: string): void {
  const original = (intl as unknown as Record<string, unknown>)[name];
  if (typeof original !== 'function') return;

  define(intl as unknown as object, name, new Proxy(original, {
    construct: (target, args, newTarget) =>
      args[0] === undefined ? unavailable(`Intl.${name}`) : Reflect.construct(target as Function, args, newTarget),
    apply: (target, thisArg, args) =>
      args[0] === undefined ? unavailable(`Intl.${name}`) : Reflect.apply(target as Function, thisArg, args),
  }));
}
