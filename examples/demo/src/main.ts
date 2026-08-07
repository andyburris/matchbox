import { component, configureMatchbox, consumeContext, ContextKey, mutableStateOf, remember, rememberContextProvider, type State } from "@matchbox/core";
import { html } from "lit-html";
import baseCss from "./index.css?inline";

const globalSheet = new CSSStyleSheet();
globalSheet.replaceSync(baseCss)
configureMatchbox({
  defaultAdoptedStylesheets: [globalSheet]
})

component("outer-counter", ({ initial, label }: { initial: number, label: string }) => {
  const [value, setValue] = remember(() => mutableStateOf(initial), [initial]);
  
  return html`
    <div>
      <p>${label}: ${value}</p>
      <inner-counter .labels=${{ outer: label, inner: "Inner" }} outer-num=${value}></inner-counter>
      <button @click=${() => setValue(value + 1)}>Increment outer</button>
    </div>
  `;
})

component("inner-counter", ({ labels, outerNum }: { labels: { outer: string, inner: string }, outerNum: number }) => {
  const { outer: outerLabel, inner: innerLabel } = labels
  // const [innerLabel, outerLabel] = ["Inner hardcoded", "Outer hardcoded"]
  const [innerValue, setInnerValue] = remember(() => mutableStateOf(0), []);
  return html`
    <p>${innerLabel}: ${innerValue}</p>
    <p>${outerLabel} + ${innerLabel}: ${outerNum + innerValue}</p>
    <button @click=${() => setInnerValue(innerValue + 1)}>Increment inner</button>
  `
})

const FRUITS = ["Apple", "Banana", "Cherry", "Durian", "Elderberry", "Fig", "Grape", "Honeydew", "Jackfruit", "Kiwi"]
const SelectedFruitContext = new ContextKey<State<string | null>>(Symbol("selected-fruit"))

component("fruit-list", () => {
  const [values, setValues] = remember(() => mutableStateOf(FRUITS.slice(0, 3)))
  const selectedValueState = remember(() => mutableStateOf<string | null>(null))


  const provideSelectedFruit = rememberContextProvider(SelectedFruitContext, () => selectedValueState, [selectedValueState.value])

  return html`
    <li @context-request=${provideSelectedFruit}>
      ${values.map((v) => html`<fruit-list-item fruit=${v}></fruit-list-item>`)}
    </li>
    <button @click=${() => setValues([...values, FRUITS[values.length]])}>Add fruit</button>
  `
})

component("fruit-list-item", ({ fruit }: { fruit: string }) => {
  const selectedFruitState = remember(() => consumeContext(SelectedFruitContext)).value
  const isSelected = selectedFruitState.value === fruit

  return html`
    <div 
      style=${isSelected ? "font-weight: 700;" : ""} 
      @mouseenter=${() => selectedFruitState.setValue(fruit)} 
      @mouseleave=${() => selectedFruitState.setValue(null)}
    >
      ${fruit}
    </div>
  `
})