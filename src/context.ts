import { runtime } from "./reactivity";
import { Disposable, remember } from "./remember";

// @ts-ignore unused generic
export class ContextKey<T> {
  constructor(public symbol: symbol) {}
}

export function rememberContextProvider<T>(
  key: ContextKey<T>,
  valueCalculation: () => T,
  dependencies: any[]
): (e: Event) => void {
  
  const subscribers = remember(() => new Set<ContextUpdater<T>>());
  const currentValue = valueCalculation();

  // Push changes down (per wc-context) whenever our dependency keys mutate
  remember(() => {
    subscribers.forEach((cb) => cb(currentValue));
  }, dependencies);

  // Return the standard protocol event handler
  return provideContext(key, currentValue, (callback) => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  });
}

export type ContextUpdater<T> = (newValue: T) => void;
export function provideContext<T>(key: ContextKey<T>, currentValue: T, onSubscribe?: (updater: ContextUpdater<T>) => () => void) {
  return (e: Event) => {
    const customEvent = e as CustomEvent;
    if (customEvent.detail.context !== key.symbol) return;
    
    // Halt event bubbling immediately so nested context scopes do not overwrite each other
    customEvent.stopPropagation();

    const { callback, subscribe } = customEvent.detail;

    // 1. Instantly fulfill the initial frame request synchronously
    callback(currentValue);

    // 2. If the child requests a multi-delivery subscription, hook it up
    if (subscribe && typeof onSubscribe === 'function') {
      const unsubscribe = onSubscribe(callback);
      // Return the cleanup method straight into the event loop payload
      customEvent.detail.unsubscribe = unsubscribe;
    }
  };
}

export type ContextValue<T> = {
  readonly value: T;
  [Disposable]: () => void;
}

export function consumeContext<T>(key: ContextKey<T>): ContextValue<T> {
  const controller = runtime.currentController;
  if (!controller) throw new Error("consumeContext() must be called inside a component execution context.");

  let resolvedValue: T | undefined;
  let remoteUnsubscribe: (() => void) | null = null;

  // Standard WC CustomEvent payload format
  const event = new CustomEvent('context-request', {
    bubbles: true,
    composed: true, // Breaks through Shadow DOM boundaries
    detail: {
      context: key.symbol,
      subscribe: true,
      callback: (newValue: T) => {
        resolvedValue = newValue;
        // Trigger a re-render pass on the child if the parent updates later
        if (remoteUnsubscribe) controller.performUpdate();
      }
    }
  });

  // Fires synchronously up the DOM tree
  controller.host.dispatchEvent(event);
  remoteUnsubscribe = (event.detail as any).unsubscribe || null;

  const value = {
    [Disposable]: () => remoteUnsubscribe?.()
  };

  // Use a native property getter on the string key 'value'
  Object.defineProperty(value, 'value', {
    get: () => resolvedValue,
    configurable: true,
    enumerable: true
  });

  return value as any;
}