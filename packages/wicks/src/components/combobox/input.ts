import { directive, type DirectiveResult } from "lit-html/directive.js";
import { ensureId } from "../../id";
import { PartDirective } from "../../part";
import { ComboboxContext, type ComboboxRoot } from "./root";

export class ComboboxInputDirective extends PartDirective<ComboboxRoot, []> {
  protected readonly context = ComboboxContext;

  private filling = false;

  get id(): string { return ensureId(this.element, "combobox-input"); }
  get query(): string { return (this.element as HTMLInputElement).value ?? ""; }

  protected attach(root: ComboboxRoot): void {
    this.element.addEventListener("input", this.onInput);
    this.element.addEventListener("keydown", this.onKeydown);
    this.element.addEventListener("click", this.onClick);
    root.setInput(this);
  }

  protected detach(root: ComboboxRoot): void {
    this.element.removeEventListener("input", this.onInput);
    this.element.removeEventListener("keydown", this.onKeydown);
    this.element.removeEventListener("click", this.onClick);
    root.clearInput(this);
  }

  /** Updates this input's value when an item is selected (only if fillInputOnSelect) is set on the root */
  fill(text: string): void {
    const input = this.element as HTMLInputElement;
    if (input.value === text) return;

    // Dispatch an event to alert any controlled state of the change
    this.filling = true;
    try {
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } finally {
      this.filling = false;
    }
  }

  sync(): void {
    const root = this.root;
    if (!root) return;

    ensureId(this.element, "combobox-input");
    this.setAttr("role", "combobox");
    this.setAttr("aria-autocomplete", "list");
    this.setAttr("autocomplete", "off");
    this.setAttr("aria-expanded", String(root.open));
    this.setAttr("aria-labelledby", root.labelId ?? null);
    this.setAttr("aria-controls", root.listId ?? null);
    this.setAttr("aria-activedescendant", root.open ? root.activeId ?? null : null);
  }

  private onInput = () => { if (!this.filling) this.root?.queryChanged(); };
  private onClick = () => this.root?.setOpen(true);

  private onKeydown = (event: Event) => {
    const root = this.root;
    if (!root) return;
    const { key, altKey } = event as KeyboardEvent;

    switch (key) {
      case "ArrowDown":
        if (altKey) root.setOpen(true);
        else if (!root.open) { root.setOpen(true); root.moveHighlight("first"); }
        else root.moveHighlight(1);
        break;
      case "ArrowUp":
        if (altKey) root.setOpen(false);
        else if (!root.open) { root.setOpen(true); root.moveHighlight("last"); }
        else root.moveHighlight(-1);
        break;
      case "Enter":
        if (!root.open || root.active === null) return;
        root.select(root.active);
        break;
      case "Escape":
        if (!root.open) return;
        root.setOpen(false);
        break;
      // Home and End belong to the caret while focus is in a text field
      default: return;
    }

    event.preventDefault();
  };
}

const inputDirective = directive(ComboboxInputDirective);
export function input(): DirectiveResult { return inputDirective(); }
