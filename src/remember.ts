
import { runtime } from "./reactivity";

export interface RememberOptions<T> {
  onDispose?: (cachedValue: T) => void;
}

export function remember<T>(
  calculation: () => T, 
  keys: any[] = [],
  options: RememberOptions<T> = {},
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
    cache.push({ value, keys, onDispose: options.onDispose });
    return value;
  }

  // Subsequent passes
  const record = cache[index];
  const keysChanged = keys.length !== record.keys.length || 
    keys.some((k, i) => k !== record.keys[i]);

  if (keysChanged) {
    if (typeof record.onDispose === 'function') {
      record.onDispose(record.value);
    }

    record.value = calculation();
    record.keys = keys;
  }

  return record.value;
}