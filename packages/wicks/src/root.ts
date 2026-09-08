import { noChange, type ElementPart } from "lit-html";
import { Directive, PartType, type PartInfo } from "lit-html/directive.js";
import { provideContext, type Context } from "./context";

export abstract class RootController<O> {
  private syncQueued = false;

  constructor(readonly element: Element) {}

  abstract setOptions(options?: O): void;

  /** Rewrites every registered part with the current state. */
  abstract sync(): void;

  protected queueSync(): void {
    if (this.syncQueued) return;
    this.syncQueued = true;
    queueMicrotask(() => { this.syncQueued = false; this.sync(); });
  }
}

export abstract class RootDirective<O, R extends RootController<O>> extends Directive {
  protected root: R | undefined;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('[wicks] roots go in an element position, e.g. <div ${tabs.root()}>');
    }
  }

  protected abstract readonly context: Context<R>;

  protected abstract create(element: Element): R;

  render(_options?: O): typeof noChange { return noChange; }

  update(part: ElementPart, [options]: [O?]): typeof noChange {
    if (!this.root) {
      this.root = this.create(part.element);
      // Attached synchronously, so it is listening before any part's deferred request
      part.element.addEventListener("context-request", provideContext(this.context, this.root));
    }
    this.root.setOptions(options);
    return noChange;
  }
}
