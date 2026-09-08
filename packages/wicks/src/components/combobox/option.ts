import { directive, type DirectiveResult } from "lit-html/directive.js";
import { ensureId } from "../../id";
import { PartDirective } from "../../part";
import { ComboboxContext, type ComboboxRoot } from "./root";

export class ComboboxOptionDirective extends PartDirective<ComboboxRoot, [value: string]> {
  protected readonly context = ComboboxContext;

  get value(): string { return this.args[0]; }
  get id(): string { return ensureId(this.element, "combobox-option"); }
  get isHidden(): boolean { return this.element.hasAttribute("hidden"); }

  /** If not overridden by data-label, get the element text for filtering/ranking to match on */
  get label(): string {
    return this.element.getAttribute("data-label") ?? this.element.textContent ?? "";
  }

  setHidden(hidden: boolean): void { this.element.toggleAttribute("hidden", hidden); }
  scrollIntoView(): void { this.element.scrollIntoView({ block: "nearest" }); }

  protected attach(root: ComboboxRoot): void {
    this.element.addEventListener("click", this.onClick);
    this.element.addEventListener("pointermove", this.onPointerMove);
    root.addOption(this);
  }

  protected detach(root: ComboboxRoot): void {
    this.element.removeEventListener("click", this.onClick);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    root.removeOption(this);
  }

  sync(): void {
    const root = this.root;
    if (!root) return;

    ensureId(this.element, "combobox-option");
    this.setAttr("role", "option");
    this.setAttr("aria-selected", String(root.value === this.value));
    // For styling only — assistive tech reads the highlight from aria-activedescendant
    this.element.toggleAttribute("data-highlighted", root.active === this.value);
  }

  private onClick = () => this.root?.select(this.value);
  private onPointerMove = () => {
    if (this.root?.highlightOnHover) this.root.highlight(this.value);
  };
}

const optionDirective = directive(ComboboxOptionDirective);
export function option(value: string): DirectiveResult { return optionDirective(value); }
