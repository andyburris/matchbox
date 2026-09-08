declare const CONTEXT_TYPE: unique symbol;
export type Context<T> = symbol & { readonly [CONTEXT_TYPE]: T };

export function defineContext<T>(description: string): Context<T> {
  return Symbol(description) as Context<T>;
}

type ContextRequest<T> = Event & {
  readonly context: Context<T>;
  readonly callback: (value: T) => void;
  readonly subscribe?: boolean;
};

/** Builds the `context-request` listener a root attaches to its own element. */
export function provideContext<T>(key: Context<T>, value: T): (event: Event) => void {
  return (event: Event) => {
    const request = event as ContextRequest<T>;
    if (request.context !== key) return;

    // Halt event bubbling immediately so nested context scopes do not overwrite each other
    event.stopPropagation();
    request.callback(value);
  };
}

/** Dispatches a `context-request` from `element`, or undefined if nothing above it answered. */
export function requestContext<T>(element: Element, key: Context<T>): T | undefined {
  let value: T | undefined;

  const event = Object.assign(new Event('context-request', { bubbles: true, composed: true }), {
    context: key,
    subscribe: false,
    callback: (provided: T) => { value = provided; }
  });

  // Providers answer synchronously, so the value has arrived by the time dispatch returns
  element.dispatchEvent(event);
  return value;
}
