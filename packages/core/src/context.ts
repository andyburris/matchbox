import { rememberLaunchedEffect } from "./effect";
import { runtime } from "./reactivity";
import { Disposable, remember } from "./remember";
import { mutableStateOf, type State } from "./state";

declare const CONTEXT_TYPE: unique symbol;
export type Context<T> = symbol & { readonly [CONTEXT_TYPE]: T };

export function defineContext<T>(description?: string): Context<T> {
  return Symbol(description) as Context<T>;
}

type ContextCallback<T> = (value: T, unsubscribe?: () => void) => void;

type ContextRequest<T> = Event & {
  readonly context: Context<T>;
  readonly callback: ContextCallback<T>;
  readonly subscribe?: boolean;
};


/**
 * Provides `value` to every descendant consuming `context`, as a handler to attach to `@context-request`. 
 * Note that `keys` defaults to [value] rather than the usual []
 */
export function rememberContextProvider<T>(
  context: Context<T>,
  value: T,
  keys: any[] = [value]
): (e: Event) => void {
  const subscribers = remember(() => new Set<ContextCallback<T>>());

  rememberLaunchedEffect(() => {
    for (const callback of [...subscribers]) callback(value, () => subscribers.delete(callback));
  }, keys);

  // Rebuilt every render so it closes over the current value. Lit swaps the function without
  // touching the DOM listener, so this is free.
  return (e: Event) => {
    const request = e as ContextRequest<T>;
    if (request.context !== context) return;

    // Halt event bubbling immediately so nested context scopes do not overwrite each other
    request.stopPropagation();

    if (!request.subscribe) return request.callback(value);
    subscribers.add(request.callback);
    request.callback(value, () => subscribers.delete(request.callback));
  };
}

/** 
 * The nearest value provided for `context`.
 * For ergonomic purposes, this is typed as a plain T,
 * but it will be undefined if there's no provider above the component. */
export function rememberContextConsumer<T>(context: Context<T>): T {
  return remember(() => consumeContext(context)).value!;
}

function consumeContext<T>(context: Context<T>): State<T> {
  const controller = runtime.currentController;
  if (!controller) throw new Error("consumeContext() must be called inside a component execution context.");

  const state = mutableStateOf(undefined as T);
  let unsubscribe: (() => void) | undefined;
  // Standard WC protocol payload: own properties on the event, not a CustomEvent detail
  const event = Object.assign(new Event('context-request', {
    bubbles: true,
    composed: true, // Breaks through Shadow DOM boundaries
  }), {
    context,
    subscribe: true,
    callback: (value: T, unsub?: () => void) => {
      state.setValue(value);
      unsubscribe = unsub;
    },
  });

  // Fires synchronously up the DOM tree
  controller.host.dispatchEvent(event);
  return unsubscribe ? Object.assign(state, { [Disposable]: unsubscribe }) : state;
}
