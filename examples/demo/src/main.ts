import { html } from "lit-html";
import { component, configureMatchbox, ContextKey, hydrate, mutableStateOf, registerComponent, remember, rememberContextConsumer, rememberContextProvider, type State } from "matchbox-wc";
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

registerComponent("fruit-list", () => {
  const [values, setValues] = remember(() => mutableStateOf(FRUITS.slice(0, 3)))
  const selectedValueState = remember(() => mutableStateOf<string | null>(null))


  const provideSelectedFruit = rememberContextProvider(SelectedFruitContext, () => selectedValueState, [selectedValueState.value])

  return html`
    <li @context-request=${provideSelectedFruit}>
      ${values.map((v) => html`${FruitListItem(v).with({ class: "f-l-i" }, html`<em>${v}</em>`)}`)}
    </li>
    <button @click=${() => setValues([...values, FRUITS[values.length]])}>Add fruit</button>
    <button @click=${() => setValues(values.slice(0, -1))}>Remove fruit</button>
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