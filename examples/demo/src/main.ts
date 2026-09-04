import { html } from "lit-html";
import { autofocusOnOpen, component, configureMatchbox, ContextKey, defineEvent, hydrate, mutableStateOf, registerComponent, remember, rememberContextConsumer, rememberContextProvider, type State } from "matchbox-wc";
import baseCss from "./index.css?inline";

const globalSheet = new CSSStyleSheet();
globalSheet.replaceSync(baseCss)
configureMatchbox({
  defaultAdoptedStylesheets: [globalSheet],
  hydrate: hydrate,
})

registerComponent("outer-counter", (initial: number, label: string) => {
  const [value, setValue] = remember(() => mutableStateOf(initial));
  
  return html`
    <div>
      <p>${label}: ${value}</p>
      <inner-counter .labels=${{ outer: label, inner: "Inner" }} .outerNum=${value}></inner-counter>
      <button @click=${() => setValue(value + 1)}>Increment outer</button>
    </div>
  `;
}, { defaults: [{ initial: 4 }, { label: "" }] })

registerComponent("inner-counter", (labels: { outer: string, inner: string }, outerNum: number) => {
  const { outer: outerLabel, inner: innerLabel } = labels
  // const [innerLabel, outerLabel] = ["Inner hardcoded", "Outer hardcoded"]
  const [innerValue, setInnerValue] = remember(() => mutableStateOf(0), []);
  return html`
    <p>${innerLabel}: ${innerValue}</p>
    <p>${outerLabel} + ${innerLabel}: ${outerNum + innerValue}</p>
    <button @click=${() => setInnerValue(innerValue + 1)}>Increment inner</button>
  `
}, { defaults: [{ labels: { outer: "Outer", inner: "Inner" } }, { outerNum: 4 }] })


const FRUITS = ["Apple", "Banana", "Cherry", "Durian", "Elderberry", "Fig", "Grape", "Honeydew", "Jackfruit", "Kiwi"]
const SelectedFruitContext = new ContextKey<State<string | null>>()

const basket = mutableStateOf<string[]>([])
const QueryChanged = defineEvent<string>("query-changed")

registerComponent("search-field", (placeholder: string) => html`
  <input placeholder=${placeholder} @input=${(e: Event) => {
    const input = e.target as HTMLInputElement
    input.dispatchEvent(QueryChanged(input.value))
  }}>
`, { delegatesFocus: true, defaults: [{ placeholder: "" }] })


registerComponent("fruit-list", () => {
  const [basketContents] = basket
  const [query, setQuery] = remember(() => mutableStateOf(""))
  const selectedValueState = remember(() => mutableStateOf<string | null>(null))

  const provideSelectedFruit = rememberContextProvider(SelectedFruitContext, () => selectedValueState, [selectedValueState.value])

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
})

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
}, { defaults: [{ fruit: "" }] })

registerComponent("hydration-probe", () => {
  const [open, setOpen] = remember(() => mutableStateOf(false))
  const [text, setText] = remember(() => mutableStateOf(""))

  return html`
    <details ?open=${open} @toggle=${(e: Event) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Dropdown</summary>
      ${open ? html`<p>open branch</p>` : html`<em>closed branch</em>`}
    </details>
    <label>
      Text
      <input .value=${text} @input=${(e: Event) => setText((e.target as HTMLInputElement).value)}>
    </label>
    <p .title="${text.length} characters long">state: "${text}"</p>
  `
})