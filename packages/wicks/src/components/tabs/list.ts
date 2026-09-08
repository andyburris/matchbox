import { directive, type DirectiveResult } from "lit-html/directive.js";
import { PartDirective } from "../../part";
import { TabsContext, type TabsRoot } from "./root";

export class TabListDirective extends PartDirective<TabsRoot, []> {
  protected readonly context = TabsContext;

  protected attach(root: TabsRoot): void { root.addList(this); }
  protected detach(root: TabsRoot): void { root.removeList(this); }

  sync(): void {
    if (!this.root) return;
    this.setAttr("role", "tablist");
    this.setAttr("aria-orientation", this.root.orientation);
  }
}

const listDirective = directive(TabListDirective);
export function list(): DirectiveResult { return listDirective(); }
