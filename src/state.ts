import { runtime } from "./reactivity";

// State primitive type that can be destructured or used with regular members
export type State<T> = [T, (newValue: T) => void] & {
  // 0: T,
  value: T,
  // 1: (newValue: T) => void,
  setValue: (newValue: T) => void,

  // length: 2,
  // [Symbol.iterator](): IterableIterator<T | ((newValue: T) => void)>;
};

export function mutableStateOf<T>(initialValue: T): State<T> {
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

  const tuple = [] as unknown as State<T>;
  tuple["setValue"] = setter;
  tuple[1] = setter;

  // Use a native property getter on the string key '0'
  Object.defineProperty(tuple, '0', {
    get: () => stateValue,
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(tuple, 'value', {
    get: () => stateValue,
    configurable: true,
    enumerable: true
  });


  return tuple;
}
