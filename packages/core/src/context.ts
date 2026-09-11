import { runtime } from "./reactivity";
import { remember } from "./remember";
import { mutableStateOf, type State } from "./state";

declare const CONTEXT_TYPE: unique symbol;
export type Context<T> = symbol & { readonly [CONTEXT_TYPE]: T };

export function defineContext<T>(description: string): Context<T> {
  return Symbol(description) as Context<T>;
}

type ContextRequest<T> = Event & {
  readonly context: Context<T>;
  readonly callback: (value: State<T>, unsubscribe?: () => void) => void;
  readonly subscribe?: boolean;
};

/**
 * Provides `value` to every descendant consuming `context`, as a handler to attach to
 * `@context-request`.
 */
export function rememberContextProvider<T>(context: Context<T>, value: T): (e: Event) => void {
  const state = remember(() => mutableStateOf(value));
  state.setValue(value); // Ignored unless it actually changed

  return remember(() => (e: Event) => {
    const request = e as ContextRequest<T>;
    if (request.context !== context) return;

    // Halt event bubbling immediately so nested context scopes do not overwrite each other
    request.stopPropagation();
    request.callback(state);
  });
}

/** 
 * The nearest value provided for `context`.
 * For ergonomic purposes, this is typed as a plain T,
 * but it will be undefined if there's no provider above the component. */
export function rememberContextConsumer<T>(context: Context<T>): T {
  return remember(() => consumeContext(context))?.value!;
}

function consumeContext<T>(context: Context<T>): State<T> | undefined {
  const controller = runtime.currentController;
  if (!controller) throw new Error("consumeContext() must be called inside a component execution context.");

  let resolvedState: State<T> | undefined;

  // Standard WC protocol payload: own properties on the event, not a CustomEvent detail
  const event = Object.assign(new Event('context-request', {
    bubbles: true,
    composed: true, // Breaks through Shadow DOM boundaries
  }), {
    context,
    subscribe: false,
    callback: (state: State<T>) => { resolvedState = state; }
  });

  // Fires synchronously up the DOM tree
  controller.host.dispatchEvent(event);
  return resolvedState;
}
