import { directive, type DirectiveResult } from "lit-html/directive.js";
import { defineContext } from "../../context";
import { RootController, RootDirective } from "../../root";
import type { TabListDirective } from "./list";
import type { PanelDirective } from "./panel";
import type { TabDirective } from "./tab";

export type TabsOrientation = "horizontal" | "vertical";
export type TabsActivation = "automatic" | "manual";

export type TabsOptions = {
  /** Controls which tab is currently active. If not set, the tab component will control the state internally. */
  value?: string | null;
  /** Which arrow keys move between tabs. Defaults to horizontal. */
  orientation?: TabsOrientation;
  /** Whether moving focus also selects, or Enter/Space is required. Defaults to automatic. */
  activation?: TabsActivation;
};

export const TabsContext = defineContext<TabsRoot>("wicks-tabs");

export class TabsRoot extends RootController<TabsOptions> {
  private readonly tabs = new Set<TabDirective>();
  private readonly panels = new Set<PanelDirective>();
  private readonly lists = new Set<TabListDirective>();

  private ownValue: string | null = null;
  private controlledValue: string | null = null;
  private isControlled = false;
  private focusedValue: string | null = null;

  private resolved: string | null = null;

  orientation: TabsOrientation = "horizontal";
  activation: TabsActivation = "automatic";

  get value(): string | null { return this.resolved; }

  /** The one tab reachable with Tab. Follows focus, so manual activation still restores correctly. */
  get tabStop(): string | null {
    return this.focusedValue ?? this.value;
  }

  setOptions(options: TabsOptions = {}): void {
    // Passing the key at all takes control, so `{ value: null }` is controlled-and-empty
    this.isControlled = "value" in options;
    this.controlledValue = options.value ?? null;
    this.orientation = options.orientation ?? "horizontal";
    this.activation = options.activation ?? "automatic";
    this.sync();
  }

  select(value: string): void {
    this.focusedValue = value;
    const stored = this.isControlled ? this.controlledValue : this.ownValue;
    if (stored !== value) {
      if (!this.isControlled) this.ownValue = value;
      this.element.dispatchEvent(new CustomEvent("tabs-change", {
        detail: value, bubbles: true, composed: true
      }));
    }

    this.sync();
  }

  moveFocus(from: TabDirective, to: number | "first" | "last"): void {
    const tabs = this.orderedTabs();
    if (tabs.length === 0) return;

    const index = to === "first" ? 0
      : to === "last" ? tabs.length - 1
      : (tabs.indexOf(from) + to + tabs.length) % tabs.length;

    const next = tabs[index];
    this.focusedValue = next.value;
    next.focus();

    if (this.activation === "automatic") this.select(next.value);
    else this.sync();
  }

  addTab(tab: TabDirective): void { this.tabs.add(tab); this.queueSync(); }
  removeTab(tab: TabDirective): void { this.tabs.delete(tab); this.queueSync(); }
  addPanel(panel: PanelDirective): void { this.panels.add(panel); this.queueSync(); }
  removePanel(panel: PanelDirective): void { this.panels.delete(panel); this.queueSync(); }
  addList(list: TabListDirective): void { this.lists.add(list); this.queueSync(); }
  removeList(list: TabListDirective): void { this.lists.delete(list); this.queueSync(); }

  panelId(value: string): string | undefined {
    return [...this.panels].find((panel) => panel.value === value)?.id;
  }

  tabId(value: string): string | undefined {
    return [...this.tabs].find((tab) => tab.value === value)?.id;
  }

  /** Gets the selected tab. If it's unset, resolves to the first option */
  private resolve(): void {
    const chosen = this.isControlled ? this.controlledValue : this.ownValue;
    this.resolved = chosen ?? this.orderedTabs()[0]?.value ?? null;
  }

  orderedTabs(): TabDirective[] {
    return [...this.tabs].sort((a, b) => (a.comesBefore(b) ? -1 : 1));
  }

  sync(): void {
    this.resolve();

    for (const list of this.lists) list.sync();
    for (const tab of this.tabs) tab.sync();
    for (const panel of this.panels) panel.sync();
  }
}

class TabsRootDirective extends RootDirective<TabsOptions, TabsRoot> {
  protected readonly context = TabsContext;
  protected create(element: Element): TabsRoot { return new TabsRoot(element); }
}

const tabsRoot = directive(TabsRootDirective);
export function root(options?: TabsOptions): DirectiveResult { return tabsRoot(options); }
