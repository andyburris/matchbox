import { noChange, type ElementPart } from "lit-html";
import { AsyncDirective } from "lit-html/async-directive.js";
import { PartType, type PartInfo } from "lit-html/directive.js";
import { requestContext, type Context } from "./context";

/**
 * Base for a directive that belongs to a root: finds the root providing `context`, keeps its
 * element in sync with the latest arguments, and detaches when the element is removed.
 */
export abstract class PartDirective<R, A extends unknown[]> extends AsyncDirective {
  public element!: Element;
  protected root: R | undefined;
  protected args!: A;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('[wicks] parts go in an element position, e.g. <button ${tabs.tab("one")}>');
    }
  }

  /** The context that a root of this pattern provides. */
  protected abstract readonly context: Context<R>;

  /** Register with the root and add any listeners this part needs. */
  protected abstract attach(root: R): void;

  /** Undo everything attach() did. */
  protected abstract detach(root: R): void;

  /** Write the current arguments and root state onto the element. */
  abstract sync(): void;

  render(..._args: A): typeof noChange { return noChange; }

  update(part: ElementPart, args: A): typeof noChange {
    this.element = part.element;
    this.args = args;

    if (this.root) {
      this.sync();
    } else {
      // Element parts are committed before the fragment holding them is inserted, so until
      // the current render finishes there is no ancestor for a context request to reach.
      queueMicrotask(() => this.findRoot());
    }

    return noChange;
  }

  private findRoot(): void {
    if (this.root || !this.isConnected) return;

    const root = requestContext(this.element, this.context);
    if (!root) return;

    this.root = root;
    this.attach(root);
    this.sync();
  }

  protected disconnected(): void {
    if (this.root) this.detach(this.root);
    this.root = undefined;
  }

  protected reconnected(): void {
    this.findRoot();
  }

  public comesBefore(other: PartDirective<R, A>): boolean {
    return !!(this.element.compareDocumentPosition(other.element) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  protected setAttr(name: string, value: string | null): void {
    if (value === null) this.element.removeAttribute(name);
    else if (this.element.getAttribute(name) !== value) this.element.setAttribute(name, value);
  }

}
