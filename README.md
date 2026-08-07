# Matchbox

A tiny library for writing [web components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) declaratively.

## Quick start
`index.ts`
```ts
import { html } from "lit-html";
import { component, mutableStateOf, remember } from "../../src";

component("my-counter", ({ initial, label }: { initial: number, label: string }) => {
  const [value, setValue] = remember(() => mutableStateOf(initial), [initial]);
  
  return html`
    <div>
      <p>${label}: ${value}</p>
      <button @click=${() => setValue(value + 1)}>Increment</button>
    </div>
  `;
})
```

and use in `index.html` with:
```html
<!DOCTYPE html>
<html>
<body>
  <my-counter label="Count" initial="1"></my-counter>
  <script type="module" src="/index.ts"></script>
</body>
</html>
```

## Architecture
Matchbox uses a top-down, functional architecture for creating components.
This should be very familiar if you're coming from React or Jetpack Compose, but maybe less so if you're coming from Vanilla JS, or class-based components like Lit or the old React.

<details>
  <summary>A brief introduction to declarative UI</summary>
  Conceptually, you can think of a Matchbox component as a pure function where the inputs are the component's state, and the output is a new DOM tree. Any time a piece of state changes, the function gets rerun, so the component's DOM is always in sync with the state. (This is conceptual—in practice, `lit-html` makes it so the DOM gets surgically updated.)

  ```ts
  component("my-component", ({ label, num }: { label: string, num: number }) => {
    console.log("rerendered!")
    return html`<p>${label}: ${num}</p>`
  })
  ```
  For example, for each instance of this component, any time that the `label` or `num` attributes get changed (whether that's manually in the DOM, or by a parent web component), it will run the function, print `"rerendered!"` to the console, and update the internal DOM of the instance to reflect the new state.

  If all that was possible was stateless functions, we could only render static components (without manual DOM manipulation). 
</details>

Matchbox provides two core primitives to maintain state between renders, namely, `remember()` and `State`.

### `remember()`

You can `remember` any value, and it will be calculated on the first render, then reused on subsequent renders. Optionally, you can add an array of dependencies, where the value will be recalculated any time one of them changes. 
```ts
component(({ num }: { num: number }) => {
  const initial = remember(() => num)
  const everyOther = remember(() => num, [Math.floor((num - initial) / 2)])
  return html`
    <p>Initial number: ${initial}</p>
    <p>Every other: ${everyOther}</p>
    <p>Live number: ${num}</p>
  `
})
```

> *Note: for React users, `remember` is almost identical conceptually to `useMemo`.*

### `State`
Often, you'll want to `remember` a `State`, which is a simple `[value, setValue]` tuple that rerenders the component whenever you set its value.
```ts
component(({ initial }: { initial: number }) => {
  const [num, setNum] = remember(() => mutableStateOf(initial))
  return html`
    <button @click=${() => setNum(num + 1)}>${num}</button>
  `
})
```
> *One thing to note: it's completely possible to create a `State` outside of a `remember()` block, but it will get recalculated and reset on every render in that case, making it mostly useless.*

### Composing primitives
With just the `remember()` and `State<T>` primitives, you can compose them into much more complex functionality. 

We don't include a built-in `rememberState()` function in order to emphasize that these are two separate primitives, but it would be trivial to implement:

```ts
function rememberState<T>(initialState: T) {
  return remember(() => mutableStateOf(initialState))
}
```

For React users, many hooks you're used to can be re-implemented this way. For example, we provide `rememberLaunchedEffect`, which is roughly equivalent to `useEffect`. It's best practice to start these function names with "remember", to indicate there's memoization going on.

## Features
Matchbox includes a selevtive handful of niceties to solve some of the main ergonomic issues with web components.

### Pre-rendering
By default, Matchbox renders components' `innerHTML` at runtime (per usual with web components). For users with poor internet connection or with Javascript turned off, this can result in long stretches with no content. `@matchbox/ssr` contains a script that renders the initial state of your components into [Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom). Any component that uses browser-only APIs (such as `localStorage`), won't be prerendered. 

It can be used on the command line with:
```bash
tsx prerender.ts index1.html index2.html etc.html --outDir ./dist
```

or as a Vite plugin with

```ts
import { matchboxPrerenderPlugin } from '@matchbox/ssr';
export default defineConfig({
  plugins: [
    matchboxPrerenderPlugin(),
    // ... other plugins
  ]
  // ... rest of the vite config
})
```

### Default stylesheets
Matchbox allows you to configure default stylesheets that apply to all created components (e.g. resets, Tailwind). At the top level of your Javascript, get your CSS as a string and run:

```ts
const css = ... // import with Vite, construct using Lit's css`` template, write manually, etc.

const globalSheet = new CSSStyleSheet();
globalSheet.replaceSync(css)
configureMatchbox({ defaultAdoptedStylesheets: [globalSheet] })
```

You can override the `adoptedStyleSheets` for any component like so:
```ts
component(
  "my-component", 
  () => html`<p>Component</p>`, 
  { adoptedStyleSheets: [] },
)
```
Per-component `adoptedStyleSheets` are quite useful. You can split your CSS into smaller sections and only import the relevant ones for each component, use Lit's ```css` ` ```  tagged template, or anything else.

### Context
For many (arguably most) UI components, it's better to assemble composable parent and child pieces rather than having each parent component dictate exactly what it's child components are. For instance:
```ts
component("list-parent", ({ items }: { items: string }) => html`
  <ul>
    ${items.map((item, i) => html`<li>${i}. ${item}</li>`)}
  <ul>
`)
```
is less flexible than
```ts
component("list-parent")
```

Web components have great support for this with `<slot>`s, but passing data between unrelated components can be difficult. To help with this, Matchbox provides two helpers: `rememberContextProvider` and `rememberContextConsumer`. These conform to the [Web Component Context Protocol](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md).

First, somewhere outside of both components (probably at the top level), declare a `ContextValue<T>`. `T` can be any type, including a `State`.
```ts
const DemoContext = new ContextValue<State<string | null>>("optional description");
```

To provide that context in the parent component, attach the handler returned by `rememberContextProvider` to the `@context-request` event. `rememberContextProvider` takes the same dependencies array as `remember`, and any components subscribed to that context will update whenever the dependencies do.

```ts
component("demo-listbox", () => {
  const selectedState = remember(() => mutableStateOf<string | null>(null))
  const contextProvider = rememberContextProvider(DemoContext, selectedState, [selectedState.value]);
  return html`
    <ul role="listbox" @context-request=${contextProvider}>
      <slot></slot>
    </ul>
  `
})
```

Then to access that context in a child component, use `rememberContextConsumer` like a regular value.
```ts
component("demo-list-item", ({ value }: { value: string }) => {
  const [selectedValue, setSelectedValue] = rememberContextConsumer(DemoContext);
  const isSelected = selectedValue === value;
  return html`
    <li 
      role="option" 
      aria-selected=${isSelected}
      @mouseenter=${() => setSelectedValue(value)}
    >${value}</li>
  `
})
```

(For ergonomics, this returns a non-nullable type. If you have scenarios where a consumer might exist with no provider above it, cast the value to `T | undefined`.)


## Advanced features
### Cleaning up `remember`s
Matchbox exports a [symbol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) called `Disposable`.
If you return an object from `remember` and it has a field where the key is `Disposable` and the value is a function, that function will get called before any recalculation, and before the component gets destroyed. This allows you to clean up any long-running actions so they don't leak memory. 

For an example of how this is used, see `rememberLaunchedEffect`.