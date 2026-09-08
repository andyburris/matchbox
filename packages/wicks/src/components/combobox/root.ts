import { directive, type DirectiveResult } from "lit-html/directive.js";
import { defineContext } from "../../context";
import { RootController, RootDirective } from "../../root";
import type { ComboboxInputDirective } from "./input";
import type { ComboboxLabelDirective } from "./label";
import type { ComboboxListDirective } from "./list";
import type { ComboboxOptionDirective } from "./option";

export type Ranker = (query: string, text: string) => number;

export type ComboboxOptions = {
  /** Controls the value selected by the combobox. If not set, the combobox will control the value internally. */
  value?: string | null;
  /** Controls whether the combobox's list is showing. If not set, the combobox will control whether it's showing internally. */
  open?: boolean;
  /** Whether the first matching item is highlighted automatically while filtering. Defaults to false. */
  autoHighlight?: boolean;
  /** Whether moving the pointer over items should highlight them. Defaults to true. */
  highlightOnHover?: boolean;
  /** Writes the chosen option's label into the input on select. Defaults to false. */
  fillInputOnSelect?: boolean;
  /**
   * If (and only if) the items in the combobox aren't being controlled (aka being dynamically rendered by React, Lit, etc.),
   * allow the combobox to internally rank and filter the items.
   * If the items are being controlled, this will usually throw an error.
   */
  rankAndFilterUncontrolledItems?: Ranker;
};

export const ComboboxContext = defineContext<ComboboxRoot>("wicks-combobox");

export class ComboboxRoot extends RootController<ComboboxOptions> {
  private readonly options = new Set<ComboboxOptionDirective>();
  private readonly lists = new Set<ComboboxListDirective>();
  private input: ComboboxInputDirective | undefined;
  private label: ComboboxLabelDirective | undefined;

  private ownValue: string | null = null;
  private controlledValue: string | null = null;
  private valueIsControlled = false;

  private ownOpen = false;
  private controlledOpen = false;
  private openIsControlled = false;

  private activeValue: string | null = null;

  autoHighlight = false;
  highlightOnHover = true;
  fillInputOnSelect = false;
  private ranker: Ranker | undefined;

  constructor(element: Element) {
    super(element);
    element.addEventListener("focusout", this.onFocusOut);
  }

  get value(): string | null { return this.valueIsControlled ? this.controlledValue : this.ownValue; }
  get open(): boolean { return this.openIsControlled ? this.controlledOpen : this.ownOpen; }
  get active(): string | null { return this.activeValue; }
  get query(): string { return this.input?.query ?? ""; }

  get inputId(): string | undefined { return this.input?.id; }
  get labelId(): string | undefined { return this.label?.id; }
  get listId(): string | undefined { return [...this.lists][0]?.id; }
  get activeId(): string | undefined {
    return this.activeValue === null ? undefined : this.optionFor(this.activeValue)?.id;
  }

  setOptions(options: ComboboxOptions = {}): void {
    this.valueIsControlled = "value" in options;
    this.controlledValue = options.value ?? null;
    this.openIsControlled = "open" in options;
    this.controlledOpen = options.open ?? false;
    this.autoHighlight = options.autoHighlight ?? false;
    this.highlightOnHover = options.highlightOnHover ?? true;
    this.fillInputOnSelect = options.fillInputOnSelect ?? false;
    this.ranker = options.rankAndFilterUncontrolledItems;
    this.sync();
  }

  select(value: string | null): void {
    if (!this.valueIsControlled) this.ownValue = value;
    this.emit("combobox-change", value);
    this.setOpen(false);
    if (this.fillInputOnSelect) {
      this.input?.fill(value === null ? "" : this.optionFor(value)?.label ?? "");
    }
    this.sync();
  }

  setOpen(open: boolean): void {
    if (this.open === open) return;
    if (!this.openIsControlled) this.ownOpen = open;
    if (!open) this.activeValue = null;
    this.emit("combobox-open-change", open);
    this.sync();
  }

  highlight(value: string | null): void {
    if (this.activeValue === value) return;
    this.activeValue = value;
    this.emit("combobox-highlight", value);
    this.sync();
    if (value !== null) this.optionFor(value)?.scrollIntoView();
  }

  moveHighlight(to: 1 | -1 | "first" | "last"): void {
    const options = this.visibleOptions();
    if (options.length === 0) return;

    const current = options.findIndex((option) => option.value === this.activeValue);
    const index = to === "first" ? 0
      : to === "last" ? options.length - 1
      : current < 0 ? (to === 1 ? 0 : options.length - 1)
      : (current + to + options.length) % options.length;

    this.highlight(options[index].value);
  }

  /** Called by the input part whenever its value changes. */
  queryChanged(): void {
    this.setOpen(true);
    this.applyRanking();
    this.highlight(this.autoHighlight ? this.visibleOptions()[0]?.value ?? null : null);
    this.sync();
  }

  addOption(option: ComboboxOptionDirective): void { this.options.add(option); this.queueSync(); }
  removeOption(option: ComboboxOptionDirective): void {
    this.options.delete(option);
    if (this.activeValue === option.value) this.activeValue = null;
    this.queueSync();
  }
  addList(list: ComboboxListDirective): void { this.lists.add(list); this.queueSync(); }
  removeList(list: ComboboxListDirective): void { this.lists.delete(list); this.queueSync(); }
  setInput(input: ComboboxInputDirective): void { this.input = input; this.queueSync(); }
  clearInput(input: ComboboxInputDirective): void {
    if (this.input === input) this.input = undefined;
    this.queueSync();
  }
  setLabel(label: ComboboxLabelDirective): void { this.label = label; this.queueSync(); }
  clearLabel(label: ComboboxLabelDirective): void {
    if (this.label === label) this.label = undefined;
    this.queueSync();
  }

  optionFor(value: string): ComboboxOptionDirective | undefined {
    return [...this.options].find((option) => option.value === value);
  }

  visibleOptions(): ComboboxOptionDirective[] {
    return [...this.options]
      .filter((option) => !option.isHidden)
      .sort((a, b) => (a.comesBefore(b) ? -1 : 1));
  }

  hasVisibleOptionsIn(list: ComboboxListDirective): boolean {
    for (const option of this.options) {
      if (!option.isHidden && list.holds(option)) return true;
    }
    return false;
  }

  get controlsItems(): boolean { return this.ranker !== undefined; }

  sync(): void {
    this.element.toggleAttribute("data-open", this.open);

    this.label?.sync();
    this.input?.sync();
    for (const list of this.lists) list.sync();
    for (const option of this.options) option.sync();
  }

  private applyRanking(): void {
    const ranker = this.ranker;
    if (!ranker) return;

    for (const list of this.lists) {
      // The set preserves registration order, which is the list's order before any ranking
      list.reorder(ranker, this.query, [...this.options].filter((o) => list.holds(o)));
    }
  }

  private emit(type: string, detail: unknown): void {
    this.element.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private onFocusOut = (event: Event) => {
    const next = (event as FocusEvent).relatedTarget;
    if (next instanceof Node && this.element.contains(next)) return;
    this.setOpen(false);
  };
}

class ComboboxRootDirective extends RootDirective<ComboboxOptions, ComboboxRoot> {
  protected readonly context = ComboboxContext;
  protected create(element: Element): ComboboxRoot { return new ComboboxRoot(element); }
}

const comboboxRoot = directive(ComboboxRootDirective);
export function root(options?: ComboboxOptions): DirectiveResult { return comboboxRoot(options); }
