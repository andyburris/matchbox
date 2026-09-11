import type { Window } from 'happy-dom';

const OPAQUE_NAMESPACES = ['localStorage', 'sessionStorage', 'indexedDB', 'screen'] as const;
const CLIENT_PROPERTIES = ['innerWidth', 'innerHeight', 'devicePixelRatio'] as const;
const INTL_CONSTRUCTORS = ['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'Collator'] as const;
const CRYPTO_METHODS = ['randomUUID', 'getRandomValues'] as const;



/** 
 * Throw on any access during the render function to a client-only (or random) API, 
 * which marks that component as un-prerenderable. 
 */
export function gateBrowserOnlyAPIs(window: Window): void {
  const global = window as unknown as Record<string, unknown>;
  gatedWindow = global;


  for (const name of OPAQUE_NAMESPACES) gateNamespace(global, name);
  for (const name of CLIENT_PROPERTIES) warnOnProperty(global, name);
  gateProperty(window.navigator as unknown as object, 'language');
  gateProperty(window.navigator as unknown as object, 'languages');
  gateProperty(window.document as unknown as object, 'cookie');

  gateMethod(global, 'matchMedia', 'matchMedia');
  gateMethod(global.Math as object, 'random', 'Math.random()');
  for (const name of CRYPTO_METHODS) gateMethod(global.crypto as object, name, `crypto.${name}()`);

  gateLocaleMethods(window.Date.prototype, ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']);
  gateLocaleMethods(window.Number.prototype, ['toLocaleString']);
  for (const name of INTL_CONSTRUCTORS) gateIntl(window.Intl, name);
  gateAmbientClock(global);
}

/* RENDER CHECK */

/** Save the window being prerendered globally to not have to pass it down everywhere */
let gatedWindow: Record<string, unknown> | null = null;
function isRendering(): boolean {
  const runtime = gatedWindow?.__matchboxHydrationRuntime as { currentController: unknown } | undefined;
  return runtime?.currentController != null;
}

/* UNAVAILABLE */

function unavailableMessage(name: string): string {
  return `[matchbox] ${name} is not available during prerendering — it varies between the build and the ` +
    `visitor's browser, so the prerendered HTML wouldn't match what the client renders.`;
}

function unavailable(name: string): never {
  const message = `[matchbox] ${name} is not available during prerendering — it varies between the build and the ` +
    `visitor's browser, so the prerendered HTML wouldn't match what the client renders.`

  console.warn(message)
  throw new Error(message);
}

/* GATING */

/** Client APIs are usually accessors on a prototype rather than own properties. */
function realDescriptor(target: object, name: string): PropertyDescriptor | undefined {
  for (let object: object | null = target; object; object = Object.getPrototypeOf(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    if (descriptor) return descriptor;
  }
  return undefined;
}

function gateMethod(target: object, name: string, label: string): void {
  const original = (target as Record<string, (...args: unknown[]) => unknown>)[name];
  define(target, name, function (this: unknown, ...args: unknown[]) {
    if (isRendering()) unavailable(label);
    return original.apply(this ?? target, args);
  });
}


function define(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
}

function gateProperty(target: object, name: string): void {
  const descriptor = realDescriptor(target, name);
  const originalRead = descriptor?.get ?? (() => descriptor?.value);
  Object.defineProperty(target, name, {
    configurable: true,
    get: () => isRendering() ? unavailable(name) : originalRead.call(target),
  });
}

/** 
 * Wraps the object itself rather than replacing the window property with an accessor: Happy DOM
 * runs page scripts in a VM whose global object discards exceptions thrown while reading a
 * property, so an accessor here would silently read as undefined.
 */
function gateNamespace(global: Record<string, unknown>, name: string): void {
  const real = global[name];
  if (typeof real !== 'object' || real === null) return;

  define(global, name, new Proxy(real, {
    get: (target, key) => {
      if (isRendering()) unavailable(`${name}.${String(key)}`);
      const member = Reflect.get(target, key);
      // Methods lose their receiver through the Proxy, so hand back a bound copy
      return typeof member === 'function' ? member.bind(target) : member;
    },
  }));
}

/** 
 * Primitives on the window can only be warned about, for the same reason — there is no value
 * to wrap, and a throw would be discarded. The real value is returned, so a component using one
 * still prerenders, and the mismatch surfaces on the client instead.
 */
function warnOnProperty(global: Record<string, unknown>, name: string): void {
  const descriptor = realDescriptor(global, name);
  const originalRead = descriptor?.get ?? (() => descriptor?.value);
  Object.defineProperty(global, name, {
    configurable: true,
    enumerable: true,
    get: () => {
      if (isRendering()) console.warn(unavailableMessage(name));
      return originalRead.call(global);
    },
  });
}

/** 
 * Only throws when the locale is left to the environment — `toLocaleDateString('en-US')`
 * is deterministic and safe to prerender.
 */
function gateLocaleMethods(prototype: object, names: readonly string[]): void {
  for (const name of names) {
    const original = (prototype as Record<string, (...args: unknown[]) => unknown>)[name];
    define(prototype, name, function (this: unknown, ...args: unknown[]) {
      if (args[0] === undefined && isRendering()) unavailable(`${name}()`);
      return original.apply(this, args);
    });
  }
}

function gateIntl(intl: typeof Intl, name: string): void {
  const original = (intl as unknown as Record<string, unknown>)[name];
  if (typeof original !== 'function') return;

  define(intl as unknown as object, name, new Proxy(original, {
    construct: (target, args, newTarget) =>
      args[0] === undefined && isRendering() ? unavailable(`Intl.${name}`) : Reflect.construct(target as Function, args, newTarget),
    apply: (target, thisArg, args) =>
      args[0] === undefined && isRendering() ? unavailable(`Intl.${name}`) : Reflect.apply(target as Function, thisArg, args),
  }));
}

/**
 * Only the argument-free forms read the build machine's clock. `new Date(value)`, `Date.parse`,
 * and `Date.UTC` all produce the same result in the browser, so they stay open.
 */
function gateAmbientClock(global: Record<string, unknown>): void {
  const realDate = global.Date as DateConstructor;
  define(global, 'Date', new Proxy(realDate, {
    construct: (target, args, newTarget) =>
      args.length === 0 && isRendering() ? unavailable('new Date()') : Reflect.construct(target, args, newTarget),
    get: (target, key, receiver) => {
      if (key !== 'now') return Reflect.get(target, key, receiver);
      return () => (isRendering() ? unavailable('Date.now()') : target.now());
    },
  }));
}
