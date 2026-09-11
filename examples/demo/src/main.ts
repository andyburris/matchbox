import { combobox, tabs } from "@matchbox-wc/wicks";
import { html } from "lit-html";
import { autofocusOnOpen, component, configureMatchbox, defineContext, defineEvent, hydrate, type MutableState, mutableStateOf, remember, rememberContextConsumer, rememberContextProvider } from "matchbox-wc";
import baseCss from "./index.css?inline";

const globalSheet = new CSSStyleSheet();
globalSheet.replaceSync(baseCss)
configureMatchbox({
  defaultAdoptedStylesheets: [globalSheet],
  hydrate: hydrate,
})

component((initial: number, label: string) => {
  const [value, setValue] = remember(() => mutableStateOf(initial));
  
  return html`
    <div>
      <p>${label}: ${value}</p>
      ${InnerCounter({ outer: label, inner: "Inner" }, value)}
      <button @click=${() => setValue(value + 1)}>Increment outer</button>
    </div>
  `;
}).register("outer-counter", [{ initial: 4 }, { label: "" }])

const InnerCounter = component((labels: { outer: string, inner: string }, outerNum: number) => {
  const { outer: outerLabel, inner: innerLabel } = labels
  // const [innerLabel, outerLabel] = ["Inner hardcoded", "Outer hardcoded"]
  const [innerValue, setInnerValue] = remember(() => mutableStateOf(0), []);
  return html`
    <p>${innerLabel}: ${innerValue}</p>
    <p>${outerLabel} + ${innerLabel}: ${outerNum + innerValue}</p>
    <button @click=${() => setInnerValue(innerValue + 1)}>Increment inner</button>
  `
}).register("inner-counter", [{ labels: { outer: "Outer", inner: "Inner" } }, { outerNum: 4 }])


const FRUITS = ["Apple", "Banana", "Cherry", "Durian", "Elderberry", "Fig", "Grape", "Honeydew", "Jackfruit", "Kiwi"]
const SelectedFruitContext = defineContext<MutableState<string | null>>("selected-fruit")

const basket = mutableStateOf<string[]>([])
const QueryChanged = defineEvent<string>("query-changed")

component((placeholder: string) => html`
  <input placeholder=${placeholder} @input=${(e: Event) => {
    const input = e.target as HTMLInputElement
    input.dispatchEvent(QueryChanged(input.value))
  }}>
`, { delegatesFocus: true }).register("search-field", [{ placeholder: "" }])


component(() => {
  const [basketContents] = basket
  const [query, setQuery] = remember(() => mutableStateOf(""))
  const selectedValueState = remember(() => mutableStateOf<string | null>(null))

  const provideSelectedFruit = rememberContextProvider(SelectedFruitContext, selectedValueState)

  const shown = FRUITS.filter((fruit) => fruit.toLowerCase().includes(query.toLowerCase()))

  return html`
    <button popovertarget="fruit-search">${basketContents.length} fruit${basketContents.length ? "s" : ""} in basket</button>
    <div popover id="fruit-search" ${autofocusOnOpen()}>
      <search-field autofocus placeholder="Fruit name" ${QueryChanged.listen(setQuery)}></search-field>
      <div @context-request=${provideSelectedFruit}>
        ${shown.map((v) => html`${FruitListItem(v).with({ class: "f-l-i" }, html`<em>${v}</em>`)}`)}
      </div>
    </div>
  `
}).register("fruit-list")

const FruitListItem = component((fruit: string) => {
  const [selectedFruit, setSelectedFruit] = rememberContextConsumer(SelectedFruitContext)
  const isSelected = selectedFruit === fruit

  return html`
    <div 
      style=${isSelected ? "font-weight: 700;" : ""} 
      @mouseenter=${() => setSelectedFruit(fruit)} 
      @mouseleave=${() => setSelectedFruit(null)}
    >
      ${fruit}
      <slot></slot>
      <button @click=${() => basket.setValue([...basket.value, fruit])}>Add to basket</button>
    </div>
  `
})

component(() => {
  const [selected, setSelected] = remember(() => mutableStateOf<string | null>(null))

  return html`
    <style>
      [role="tablist"] { display: flex; gap: 0.25rem; }
      [role="tablist"][aria-orientation="vertical"] { flex-direction: column; }
      [role="tab"][aria-selected="true"] { font-weight: 700; text-decoration: underline; }
      [role="tabpanel"] { padding: 0.5rem; border: 1px solid; }
      .vertical { display: flex; gap: 1rem; align-items: start; }
    </style>

    <p>Controlled, horizontal, automatic activation</p>
    <div ${tabs.root({ value: selected })}
         @tabs-change=${(e: Event) => setSelected((e as CustomEvent<string>).detail)}>
      <div ${tabs.list()}>
        <button ${tabs.tab("account")}>Account</button>
        <button ${tabs.tab("password")}>Password</button>
        <button ${tabs.tab("team")}>Team</button>
      </div>
      <div ${tabs.panel("account")}><p>Account settings</p></div>
      <div ${tabs.panel("password")}><p>Change your password</p></div>
      <div ${tabs.panel("team")}><p>Manage your team</p></div>
    </div>
    <p>selected: ${selected ?? "(none yet — falls back to the first tab)"}</p>

    <p>Uncontrolled, vertical, manual activation</p>
    <div class="vertical" ${tabs.root({ orientation: "vertical", activation: "manual" })}>
      <div ${tabs.list()}>
        <button ${tabs.tab("one")}>One</button>
        <button ${tabs.tab("two")}>Two</button>
        <button ${tabs.tab("three")}>Three</button>
      </div>
      <div ${tabs.panel("one")}><p>First panel</p></div>
      <div ${tabs.panel("two")}><p>Second panel</p></div>
      <div ${tabs.panel("three")}><p>Third panel</p></div>
    </div>
  `
}).register("tabs-demo", [])


const comboboxStyles = html`
  <style>
    [role="combobox"] { width: 12rem; }
    [role="listbox"] { list-style: none; margin: 0; padding: 0; border: 1px solid; width: 12rem; max-height: 9rem; overflow-y: auto; }
    [role="listbox"]:not([data-open]) { display: none; }
    [role="listbox"][data-empty]::after { content: "No matches"; display: block; padding: 0.25rem; opacity: 0.6; }
    [role="option"] { padding: 0.25rem; cursor: default; }
    [role="option"][data-highlighted] { background: Highlight; color: HighlightText; }
    [role="option"][aria-selected="true"]::after { content: " ✓"; }
  </style>
`

component(() => {
  const [query, setQuery] = remember(() => mutableStateOf(""))
  const [selected, setSelected] = remember(() => mutableStateOf<string | null>(null))

  const shown = combobox.utils.rank(query, FRUITS)

  return html`
    ${comboboxStyles}
    <div ${combobox.root({ value: selected, autoHighlight: true })}
         @combobox-change=${(e: Event) => {
           const fruit = (e as CustomEvent<string | null>).detail
           setSelected(fruit)
           // Backfilling the input is the consumer's call — wicks never touches its value
           setQuery(fruit ?? "")
         }}>
      <label ${combobox.label()}>Fruit</label>
      <input ${combobox.input()} .value=${query}
             @input=${(e: Event) => setQuery((e.target as HTMLInputElement).value)}>
      <ul ${combobox.list()}>
        ${shown.map((fruit) => html`<li ${combobox.option(fruit)}>${fruit}</li>`)}
      </ul>
    </div>
    <p>selected: ${selected ?? "(none)"}</p>
  `
}).register("fruit-picker")

component(() => html`
  ${comboboxStyles}
  <div ${combobox.root({ rankAndFilterUncontrolledItems: combobox.utils.score, autoHighlight: true, fillInputOnSelect: true })}>
    <label ${combobox.label()}>Command</label>
    <input ${combobox.input()} placeholder="Type to filter">
    <ul ${combobox.list()}>
      <li ${combobox.option("open")}>Open file</li>
      <li ${combobox.option("save")}>Save file</li>
      <li ${combobox.option("close-window")}>Close window</li>
      <li ${combobox.option("split")}>Split editor right</li>
      <li ${combobox.option("reopen")}>Reopen closed editor</li>
    </ul>
  </div>
`).register("command-palette")
