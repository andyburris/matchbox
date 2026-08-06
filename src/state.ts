import { runtime } from "./reactivity";

export type StateTuple<T> = [T, (newValue: T) => void];

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
