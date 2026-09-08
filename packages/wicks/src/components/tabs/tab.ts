import { directive, type DirectiveResult } from "lit-html/directive.js";
import { ensureId } from "../../id";
import { PartDirective } from "../../part";
import { TabsContext, type TabsRoot } from "./root";

export class TabDirective extends PartDirective<TabsRoot, [value: string]> {
  protected readonly context = TabsContext;

  get value(): string { return this.args[0]; }
  get id(): string { return ensureId(this.element, "tab"); }

  focus(): void { (this.element as HTMLElement).focus(); }

  protected attach(root: TabsRoot): void {
    this.element.addEventListener("click", this.onClick);
    this.element.addEventListener("keydown", this.onKeydown);
    root.addTab(this);
  }

  protected detach(root: TabsRoot): void {
    this.element.removeEventListener("click", this.onClick);
    this.element.removeEventListener("keydown", this.onKeydown);
    root.removeTab(this);
  }

  sync(): void {
    const root = this.root;
    if (!root) return;

    ensureId(this.element, "tab");
    this.setAttr("role", "tab");
    this.setAttr("aria-selected", String(root.value === this.value));
    this.setAttr("tabindex", root.tabStop === this.value ? "0" : "-1");

    const panelId = root.panelId(this.value);
    if (panelId) this.setAttr("aria-controls", panelId);
    else this.element.removeAttribute("aria-controls");
  }

  private onClick = () => this.root?.select(this.value);

  private onKeydown = (event: Event) => {
    const root = this.root;
    if (!root) return;

    const { key } = event as KeyboardEvent;
    const [previous, next] = root.orientation === "vertical"
      ? ["ArrowUp", "ArrowDown"]
      : ["ArrowLeft", "ArrowRight"];

    if (key === previous) root.moveFocus(this, -1);
    else if (key === next) root.moveFocus(this, 1);
    else if (key === "Home") root.moveFocus(this, "first");
    else if (key === "End") root.moveFocus(this, "last");
    // A <button> turns Enter and Space into a click on its own, and select() is idempotent
    else if (key === "Enter" || key === " ") { root.select(this.value); return; }
    else return;

    event.preventDefault();
  };
}

const tabDirective = directive(TabDirective);
export function tab(value: string): DirectiveResult { return tabDirective(value); }
