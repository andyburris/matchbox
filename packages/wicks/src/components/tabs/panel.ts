import { directive, type DirectiveResult } from "lit-html/directive.js";
import { ensureId } from "../../id";
import { PartDirective } from "../../part";
import { TabsContext, type TabsRoot } from "./root";

export class PanelDirective extends PartDirective<TabsRoot, [value: string]> {
  protected readonly context = TabsContext;

  get value(): string { return this.args[0]; }
  get id(): string { return ensureId(this.element, "tabpanel"); }

  protected attach(root: TabsRoot): void { root.addPanel(this); }
  protected detach(root: TabsRoot): void { root.removePanel(this); }

  sync(): void {
    const root = this.root;
    if (!root) return;

    ensureId(this.element, "tabpanel");
    const active = root.value === this.value;
    this.setAttr("role", "tabpanel");
    this.element.toggleAttribute("hidden", !active);

    // A panel whose content isn't focusable still has to be reachable from its tab
    if (active) this.setAttr("tabindex", "0");
    else this.element.removeAttribute("tabindex");

    const tabId = root.tabId(this.value);
    if (tabId) this.setAttr("aria-labelledby", tabId);
    else this.element.removeAttribute("aria-labelledby");
  }
}

const panelDirective = directive(PanelDirective);
export function panel(value: string): DirectiveResult { return panelDirective(value); }
