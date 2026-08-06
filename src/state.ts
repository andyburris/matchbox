import { runtime } from "./reactivity";

export type StateTuple<T> = [T, (newValue: T) => void];

export function remember<T>(calculation: () => T, keys: any[] = []): T {
  const controller = runtime.currentController;
  if (!controller) {
    throw new Error("remember() must be called inside a component execution context.");
  }

  if (!controller._hooksCache) {
    controller._hooksCache = [];
  }

  const cache = controller._hooksCache;
  const index = runtime.currentHookIndex++;

  if (index >= cache.length) {
    const value = calculation();
    cache.push({ value, keys });
    return value;
  }

  const record = cache[index];
  const keysChanged = keys.length !== record.keys.length || 
    keys.some((k, i) => k !== record.keys[i]);

  if (keysChanged) {
    record.value = calculation();
    record.keys = keys;
  }

  return record.value;
}

export function mutableStateOf<T>(initialValue: T): StateTuple<T> {
  let stateValue = initialValue;
  const boundController = runtime.currentController;

  const setter = (newValue: T) => {
    if (stateValue !== newValue) {
      stateValue = newValue;
      if (boundController) {
        boundController.performUpdate();
      }
    }
  };

  const tuple = [] as unknown as StateTuple<T>;
  tuple[1] = setter;

  // Use a native property getter on the string key '0'
  Object.defineProperty(tuple, '0', {
    get: () => stateValue,
    configurable: true,
    enumerable: true
  });

  return tuple;
}
