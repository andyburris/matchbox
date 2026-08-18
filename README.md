# Matchbox

A small library for writing [web components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) declaratively. Plus a handful of other features ([prerendering](#prerendering), [default stylesheets](#default-stylesheets), [context](#context)) that add up to a much simpler development experience.

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
This should be very familiar if you're coming from React or Jetpack Compose, but maybe less so if you're coming from Vanilla JS, or class-based components like Lit or old React.

<details>
  <summary><i>A brief introduction to declarative UI</i></summary>
  Conceptually, you can think of a Matchbox component as a pure function where the inputs are the component's state, and the output is a new DOM tree. Any time a piece of state changes, the function gets rerun, so the component's DOM is always in sync with the state. (This is only conceptual—in practice, <code>lit-html</code> surgically updates only the parts of the DOM that have changed.)
  
  Take this component as an example:
  ```ts
  component("my-component", ({ label, num }: { label: string, num: number }) => {
    console.log("rerendered!")
    return html`<p>${label}: ${num}</p>`
  })
  ```
  For each instance of this component, any time that the `label` or `num` attributes get changed (whether that's manually in the DOM, or by a parent web component), it will run the function, print `"rerendered!"` to the console, and update the internal DOM of the instance to reflect the new state.

  > *For further reading, Jetpack Compose's ["Thinking in Compose"](https://developer.android.com/develop/ui/compose/mental-model) guide is a little Android-specific in places but overall quite helpful for understanding declarative UI.*

  Of course, if all that was possible was stateless functions, you could only change the state of the component tree by changing attributes on the top-level components. So to allow for component-scoped state, Matchbox lets you memoize state across renders.
  
</details>

Matchbox provides two core primitives to maintain state between renders, namely, `remember()` and `State`.

### `remember()`

You can `remember` any value, and it will be calculated the first time an instance of a component renders, then reused on subsequent renders. Optionally, you can add an array of dependencies, where the value will be recalculated any time one of them changes. 
```ts
component(({ num }: { num: number }) => {
  const initial = remember(() => num)
  const tensDigit = Math.floor((num - initial) / 10)
  const everyTenth = remember(() => num, [tensDigit])
  return html`
    <p>Initial number: ${initial}</p>
    <p>Every tenth: ${everyTenth}</p>
    <p>Live number: ${num}</p>
  `
})
```

> *For React users, `remember` is almost identical conceptually to `useMemo`.*

### `State`
`State<T>` holds a value of type `T`. You can access it with `.value`, and set it with `.setValue()`.  Setting the value rerenders any components that rely on it. `.value` returns a plain `T`—you can use it like any other plain value, and Matchbox will keep track of which components rely on it.
```ts
component(({ initial }: { initial: number }) => {
  const [num, setNum] = remember(() => mutableStateOf(initial))
  return html`
    <button @click=${() => setNum(num + 1)}>${num}</button>
  `
})
```
> *You almost always want to create a `State` inside of a `remember()` block. It's possible to create it outside of one, but it will get recalculated and reset on every render in that case, making it mostly useless.*

### Composing primitives
You can compose the `remember()` and `State<T>` primitives, into much more complex functionality. 

We don't include a built-in `rememberState()` function in order to emphasize that these are two separate primitives, but it would be trivial to implement:

```ts
function rememberState<T>(initialState: T) {
  return remember(() => mutableStateOf(initialState))
}
```

For any functions that wrap `remember`, it's best practice to start their names with "remember", to indicate there's memoization going on.

> *For React users, many hooks you're used to can be re-implemented this way. `rememberState` would be the equivalent to `useState`, and `useCallback` is equally trivial. Since it's a little more complicated, Matchbox provides `rememberLaunchedEffect`, which is roughly equivalent to `useEffect`.*

## Features
Matchbox includes a selective handful of niceties to solve some of the main ergonomic issues with web components.

### Prerendering
By default, Matchbox renders components' `innerHTML` at runtime (per usual with web components). For users with poor internet connection or with Javascript turned off, this can result in long stretches with no content. `@matchbox/prerender` contains a script that renders the initial state of your components into [Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom). Any component that uses browser-only APIs (e.g. `localStorage`), or randomness (e.g. `crypto.randomUUID()`, `Date.now()`) won't be prerendered. 

<!-- (Unless you override it by adding `prerender: "force"` to your component options. No promises after that.)-->

It can be used on the command line with:
```bash
matchbox-prerender index1.html index2.html --outDir ./dist
```

or as a Vite plugin with

```ts
import { matchboxPrerenderPlugin } from '@matchbox/prerender/vite';
export default defineConfig({
  plugins: [
    matchboxPrerenderPlugin(),
    // ... other plugins
  ]
  // ... rest of the vite config
})
```

On the client side, you need to connect the Javascript to the existing components (a process called "hydration"). At the top level of your main script on the client, add hydration to your Matchbox configuration:
```ts
import { hydrate } from "@matchbox/core";

configureMatchbox({ hydrate: hydrate })
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
component("list-parent", ({ items }: { items: string[] }) => html`
  <ul>
    ${items.map((item, i) => html`<li>${i}. ${item}</li>`)}
  <ul>
`)
```
```html
<list-parent .items={["a", "b", "c"]}></list-parent>
```
is less flexible than
```ts
component("list-parent", () => html`
  <ul>
    <slot></slot>
  </ul>
`)
```
```html
<list-parent>
  <li>a</li>
  <!-- can add anything here—dividers, group headers, etc. -->
  <li>b</li>
  <li>c</li>
</list-parent>
```

Web components have great support for this with `<slot>`s, but passing data between unrelated components can be difficult. To help with this, Matchbox provides two helpers: `rememberContextProvider` and `rememberContextConsumer`. These conform to the [Web Component Context Protocol](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md).

First, somewhere outside of both components (probably at the top level of a file), declare a `ContextValue<T>`. `T` can be any type, including a `State`.
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

(For ergonomics, `rememberContextConsumer` returns a non-nullable type, even though it will be undefined if you use it without a provider above it. If you have scenarios where that is the intended behavior, cast the value to `T | undefined`.)


## Advanced features
### Cleaning up `remember`s
Matchbox exports a [symbol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) called `Disposable`.
If you return an object from `remember` and it has a field where the key is `Disposable` and the value is a function, that function will get called before any recalculation, and before the component gets destroyed. This allows you to clean up any long-running actions so they don't leak memory. 

For an example of how this is used, see `rememberLaunchedEffect`.

## Philosophy
Matchbox aims to make web components ergonomic enough to create large-scale web apps with.

Currently, web components seem to mostly be viewed as:
1. A way to create encapsulated components meant to be reused across multiple projects, or
2. A controller for small interactive portions of mostly static sites or micro-frontends.

Much of the native API surface of web components is aligned with these goals, most notably encapsulation-by-default.

But for any project larger than a handful of components, you want your components to interact with each other, to share styles, to nest and maintain ARIA compatiblity, etc. You want components that are *not* encapsulated.

So Matchbox's API defaults to that. (Though it's still easy to make components encapsulated if necessary.) Also, in Matchbox, components are a single declarative function, rather than the boilerplate-heavy default of imperative callbacks and state and renders. 

It does all this while being extremely small and performant, keeping all the benefits of web components being so close to the platform.
(In fact, it's easier to use best practices for web components. Matchbox encourages HTML-like component construction with contexts, and has features like auto-generating Declarative Shadow DOM, so components are progressively enhanced by default rather than only running on the client side.)