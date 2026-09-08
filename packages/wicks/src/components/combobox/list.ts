import { directive, type DirectiveResult } from "lit-html/directive.js";
import { ensureId } from "../../id";
import { PartDirective } from "../../part";
import type { ComboboxOptionDirective } from "./option";
import { ComboboxContext, type ComboboxRoot, type Ranker } from "./root";

/**
 * Rough check of whether a framework is rendering these items.
 * If it is, wicks can't reorder/filter them itself or it will break the framework.
 * Frameworks anchor list items either with marker comments (lit, Vue, Svelte) or with expando properties on the nodes (React, Angular)
 */
function isFrameworkManaged(list: Element): boolean {
  for (let node = list.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === Node.COMMENT_NODE) return true;
  }
  const first = list.firstElementChild;
  return !!first && Object.keys(first).some((k) => k.startsWith("__react") || k === "__ngContext__");
}

export class ComboboxListDirective extends PartDirective<ComboboxRoot, []> {
  protected readonly context = ComboboxContext;

  get id(): string { return ensureId(this.element, "combobox-list"); }

  holds(option: ComboboxOptionDirective): boolean { return this.element.contains(option.element); }

  protected attach(root: ComboboxRoot): void {
    if (root.controlsItems) this.assertUnmanaged();

    // Keeps focus in the input, so clicking an option doesn't close the list before the click event fires
    this.element.addEventListener("mousedown", this.onMouseDown);

    root.addList(this);
  }
  protected detach(root: ComboboxRoot): void {
    this.element.removeEventListener("mousedown", this.onMouseDown);
    root.removeList(this);
  }

  private onMouseDown = (event: Event) => event.preventDefault();

  sync(): void {
    const root = this.root;
    if (!root) return;

    ensureId(this.element, "combobox-list");
    this.setAttr("role", "listbox");
    this.setAttr("aria-labelledby", root.labelId ?? null);
    this.element.toggleAttribute("data-open", root.open);
    this.element.toggleAttribute("data-empty", !root.hasVisibleOptionsIn(this));
  }

  reorder(ranker: Ranker, query: string, options: ComboboxOptionDirective[]): void {
    this.assertUnmanaged()

    const scored = options
      .map((option, index) => ({ option, index, score: ranker(query, option.label) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    for (const { option, score } of scored) {
      option.setHidden(score === 0);
      this.element.appendChild(option.element);
    }
  }

  private assertUnmanaged(): void {
    if (!isFrameworkManaged(this.element)) return;
    throw new Error(
      "[wicks] rankAndFilterUncontrolledItems cannot reorder options that a framework is rendering. " +
      "Rank them yourself with combobox.utils.rank() and render the result instead."
    );
  }

}

const listDirective = directive(ComboboxListDirective);
export function list(): DirectiveResult { return listDirective(); }
