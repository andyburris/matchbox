import { directive, type DirectiveResult } from "lit-html/directive.js";
import { ensureId } from "../../id";
import { PartDirective } from "../../part";
import { ComboboxContext, type ComboboxRoot } from "./root";

export class ComboboxLabelDirective extends PartDirective<ComboboxRoot, []> {
  protected readonly context = ComboboxContext;

  get id(): string { return ensureId(this.element, "combobox-label"); }

  protected attach(root: ComboboxRoot): void { root.setLabel(this); }
  protected detach(root: ComboboxRoot): void { root.clearLabel(this); }

  sync(): void {
    const root = this.root;
    if (!root) return;

    ensureId(this.element, "combobox-label");
    if (this.element.localName === "label") this.setAttr("for", root.inputId ?? null);
  }
}

const labelDirective = directive(ComboboxLabelDirective);
export function label(): DirectiveResult { return labelDirective(); }
