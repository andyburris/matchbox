import { noChange } from 'lit-html';
import {
    Directive,
    directive,
    PartType,
    type DirectiveResult,
    type ElementPart,
    type PartInfo,
} from 'lit-html/directive.js';

type AnyHandler = (detail: never, event: CustomEvent<never>) => void;
type AnyBinding = readonly [event: { readonly type: string }, handler: AnyHandler];
export type Binding<T> = readonly [
  event: EventDefinition<T>,
  handler: (detail: T, event: CustomEvent<T>) => void,
];

class ListenDirective extends Directive {
  private bindings: readonly AnyBinding[] = [];
  private attached = false;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('[matchbox] listen() belongs in an element position, e.g. <div ${Event.listen(fn)}>');
    }
  }

  render(_bindings: readonly AnyBinding[]): typeof noChange {
    return noChange;
  }

  update(part: ElementPart, [bindings]: [readonly AnyBinding[]]): typeof noChange {
    // Attach the DOM listeners once but swap the handlers every render
    this.bindings = bindings;

    if (!this.attached) {
      this.attached = true;
      bindings.forEach(([event], index) => {
        part.element.addEventListener(event.type, (e) => {
          const custom = e as CustomEvent<never>;
          this.bindings[index]?.[1](custom.detail, custom);
        });
      });
    }

    return noChange;
  }
}

const listenDirective = directive(ListenDirective);

/** Wires several events onto one element — one element part can only hold one directive. */
export function listenBindings<T extends readonly unknown[]>(
  bindings: { [K in keyof T]: Binding<T[K]> },
): DirectiveResult {
  return listenDirective(bindings);
}

const DEFAULT_INIT: EventInit = { bubbles: true, composed: true };

export type EventDefinition<T> = {
  (detail: T): CustomEvent<T>;
  readonly type: string;
  listen(handler: (detail: T, event: CustomEvent<T>) => void): DirectiveResult;
};

export function defineEvent<T = void>(type: string, init: EventInit = DEFAULT_INIT): EventDefinition<T> {
  const create = (detail: T): CustomEvent<T> => new CustomEvent(type, { ...init, detail });

  return Object.assign(create, {
    type,
    listen: (handler: (detail: T, event: CustomEvent<T>) => void): DirectiveResult =>
      listenDirective([[{ type }, handler]]),
  });
}
