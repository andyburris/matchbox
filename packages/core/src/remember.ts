
import { runtime } from "./reactivity";

export const Disposable = Symbol('Disposable');

// @ts-ignore unused generic
export type RememberOptions<T> = {}

export function remember<T>(
  calculation: () => T, 
  keys: any[] = [],
  // _options: RememberOptions<T> = {},
): T {

  const controller = runtime.currentController;
  if (!controller) {
    throw new Error("remember() must be called inside a component execution context.");
  }

  const cache = controller.hooksCache;
  const index = runtime.currentHookIndex++;

  // First mount
  if (index >= cache.length) {
    const value = calculation();
    cache.push({ value, keys });
    return value;
  }

  // Subsequent passes
  const record = cache[index];
  const keysChanged = keys.length !== record.keys.length || 
    keys.some((k, i) => k !== record.keys[i]);

  if (keysChanged) {
    if (record.value && typeof record.value[Disposable] === 'function') {
      record.value[Disposable]();
    }
    
    record.value = calculation();
    record.keys = keys;
  }

  return record.value;
}