import { ReactivityController, runtime } from "./reactivity";

// State primitive type that can be destructured or used with regular members
export type State<T> = readonly [T, ...unknown[]] & { readonly value: T }
export type MutableState<T> = readonly [T, (newValue: T) => void] & { readonly value: T, readonly setValue: (newValue: T) => void }

export function mutableStateOf<T>(initialValue: T): MutableState<T> {
  let stateValue = initialValue;
  const subscribers = new Set<ReactivityController>();

  const read = (): T => {
    runtime.currentController?.track(subscribers);
    return stateValue;
  };

  const setter = (newValue: T) => {
    if (stateValue === newValue) return;
    stateValue = newValue;
    // Copy the subscribers in case a notified controller un/re-subscribes
    for (const controller of [...subscribers]) controller.performUpdate();
  };

  const tuple: unknown[] = [];
  tuple[1] = setter;
  const named = tuple as unknown as Record<string, unknown>;
  named["setValue"] = setter;

  // Use a native property getter on the string key '0'
  Object.defineProperty(tuple, '0', {
    get: read,
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(tuple, 'value', {
    get: read,
    configurable: true,
    enumerable: true
  });


  return tuple as unknown as MutableState<T>;
}
