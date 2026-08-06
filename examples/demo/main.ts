import { html } from "lit-html";
import { component, mutableStateOf, remember } from "../../src";

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
  const [innerValue, setInnerValue] = remember(() => mutableStateOf(0), []);
  return html`
    <p>${innerLabel}: ${innerValue}</p>
    <p>${outerLabel} + ${innerLabel}: ${outerNum + innerValue}</p>
    <button @click=${() => setInnerValue(innerValue + 1)}>Increment inner</button>
  `
})