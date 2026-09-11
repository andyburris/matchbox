# Matchbox

A small library for writing [web components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) declaratively. Plus a handful of other features ([default stylesheets](#default-stylesheets), [context](#context), [prerendering](#prerendering)) that add up to a much simpler development experience.

![NPM Version](https://img.shields.io/npm/v/matchbox-wc)

## Quick start
Add Matchbox to your project:
```bash
npm i matchbox-wc lit-html
```
register a component in `index.ts`:
```ts
import { html } from "lit-html";
import { component, mutableStateOf, remember } from "matchbox-wc";

component((initial: number, label: string) => {
  const [value, setValue] = remember(() => mutableStateOf(initial));
  
  return html`
    <div>
      <p>${label}: ${value}</p>
      <button @click=${() => setValue(value + 1)}>Increment</button>
    </div>
  `;
}).register(
  "my-counter", // tag name
  [{ initial: 1 }, { label: "" }] // default values for attributes/properties
)
```

and use in `index.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <my-counter label="Count" initial="1"></my-counter>
  <script type="module" src="/index.ts"></script>
</body>
</html>
```

## Components
Matchbox lets you write components as functions rather than classes.
> This should be very familiar if you're coming from React or Jetpack Compose, but may be less so [if you're coming from](#a-brief-outline-of-functional-ui) Vanilla JS, or class-based components like Lit or old React. 

To create a new component, use the `component()` function:
```ts
const MyComponent = component((label: string, num: number) => {
  return html`<p>${label} + 10: ${num + 10}</p>`
})
```

`component()` takes in a render function, which takes any parameters and produces an [``` html`` ``` tagged template](#html-templates). It creates an anonymous web component, which can be used inside other ``` html`` ``` templates:
```ts
const ChildComponent = component((text: string) => html`<p>${text}</p>`)
const ParentComponent = component(() => html`<div>${ChildComponent("hello world")}</div>`)
```
> Anonymous components are still full web components, so all the usual features like [slots](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots#adding_flexibility_with_slots) and encapsulation still apply to them. More on that later.

Anonymous components can't be used in HTML. To use one in HTML, register it as a custom element by calling `.register()` with:
1. the tag name (must conform to the [`kebab-case` standard](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define#valid_custom_element_names))
2. default values for its parameters (to use if an HTML caller doesn't pass them)
```ts
component((text: string) => html`<p>${text}</p>`)
  .register("child-component", [{ text: "" }])
```
```html
<child-component text="hello world"></child-component>
```
> `.register()` returns the same type as a plain `component()`, and can be used in templates the same way.

**More information:**
- `component()` takes an optional configuration object. See [this appendix](#component-configuration).
- When creating an instance of a component using `${ChildComponent("hello world")}`, you can set attributes or properties (e.g. `class`) on it, or add children to its light DOM, using the `.with()` method. See [this appendix](#setting-attributes-properties-or-children-on-a-component).
- If you haven't used Lit's ``` html`` ``` templates before, see [this appendix](#html-templates).

### Properties and attributes
For registered components, each parameter becomes a property that you can set on the component, either inside a Lit template with `.property=${}`, or in vanilla JS with `.property = `.

Matchbox determines if each parameter should also be an attribute, which can be set in regular HTML. It will convert `camelCase` parameter names into `kebab-case` if they're attributes. In general, any `string`, `number`, or `boolean` parameters become attributes, but if you want them to only be properties, you can wrap their default in `property()`

> Note that properties and attributes are driven by the **defaults**, not the parameters of the render function. For example, if you name a default something other than the parameter name, the property (and attribute) will be the default's name. Additionally, if the default is a string, then an attribute like `attr="false"` will pass the string `"false"` into the render function. But if the default is a boolean, the same attribute will pass in the boolean `false`. (Typescript should check most of this.)


## State management
In addition to the state passed in via parameters, components can have their own internal state. (Anytime that internal state changes, the elements that rely on it re-render.)
Matchbox provides two core primitives to maintain state between renders: `remember()` and `State`.

### `remember()`

You can `remember` any value, and it will be calculated the first time an instance of a component renders, then reused on subsequent renders. Optionally, you can add an array of dependencies, where the value will be recalculated any time one of them changes. 
```ts
component((num: number) => {
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

> For React users, `remember` is almost identical conceptually to `useMemo`.

### `State`
`State<T>` holds a value of type `T`. You can access it with `.value` (or by destructuring it).
`MutableState<T>` is similar, but it also has a `.setValue()` method. Setting the value rerenders any components that rely on it.

Create a `MutableState<T>` using `mutableStateOf()`. (To get a `State<T>`, just downcast a `MutableState<T>`.)
```ts
component((initial: number) => {
  const [num, setNum] = remember(() => mutableStateOf(initial))

  return html`
    <button @click=${() => setNum(num + 1)}>${num}</button>
  `
})
```
`.value` returns a plain `T`—you can use it like any other plain value. You can use the plain value in most cases. The only exception is if a callback (`Promise`, `requestAnimationFrame`, window event handler, etc.) needs to use updates from a future render—the destrucured values will be stale, while the `State` returned from `remember()` will always hold the value from the most recent render.

> Inside the render function, you almost always want to create a `State` inside of a `remember()` block. It's possible to create it outside of one, but it will get recalculated and reset on every render in that case, making it mostly useless.

### Composing primitives
You can compose the `remember()` and `State<T>` primitives into much more complex functionality. 

We don't include a built-in `rememberState()` function in order to emphasize that these are two separate primitives, but it would be trivial to implement:

```ts
function rememberState<T>(initialState: T) {
  return remember(() => mutableStateOf(initialState))
}
```

For any functions that wrap `remember`, it's best practice to start their names with "remember", to indicate there's memoization going on.

> For React users, many hooks you're used to can be re-implemented this way. `rememberState` would be the equivalent to `useState`. `useCallback` is equally trivial. Since it's a little more complicated, Matchbox provides `rememberLaunchedEffect`, which is roughly equivalent to `useEffect`.

### State mutation and `defineEvent()`
In general in Matchbox, you want to pass data down the component tree as plain values, not `State` values, so users of your components don't need to install Matchbox to use them. But not having the source `State` makes it difficult to easily mutate state. You can always pass mutation callbacks into components as properties, but down deep trees that often becomes tedious.

Instead, you're encouraged to use the built-in event system for mutations. Matchbox provides some helpers to make the process easier.

Start by defining an event:
```ts
const AddItemEvent = defineEvent<Item>("add-item")
```

Then you can dispatch the event like any other `Event`:
```ts
component(() => {
  const item: Item = ...;
  return html`
    <button @click=${(e: Event) => e.currentTarget!.dispatchEvent(AddItemEvent(item))}>
      Click me!
    </button>
  `
})
```

Then, in the component that owns the source state, you can listen for the event on one of its elements and mutate the state:
```ts
component(() => {
  const [allItems, setAllItems] = remember(() => mutableStateOf<Item[]>([]))
  return html`
    <div ${AddItemEvent.listen((item) => setAllItems([...allItems, item]))}>
      ...
    </div>
  `
})
```

## Features
Matchbox includes a handful of features that solve some of the main ergonomic issues with web components.

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
  () => html`<p>Component</p>`, 
  { adoptedStyleSheets: [] },
)
```
Per-component `adoptedStyleSheets` are quite useful. You can split your CSS into smaller sections and only import the relevant ones for each component, use Lit's ``` css`` ```  tagged template, or anything else.

### Prerendering
By default, Matchbox renders components' `innerHTML` at runtime (per usual with web components). For users with poor internet connection or with Javascript turned off, this can result in long stretches with no content. `@matchbox-wc/prerender` contains a script that renders the initial state of your components into [Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom). Any component that uses browser-only APIs (e.g. `localStorage`) or randomness (e.g. `crypto.randomUUID()`, `Date.now()`) in its render function won't be prerendered. 

<!-- Closed shadow roots won't be prerendered. -->
<!-- (Unless you override it by adding `prerender: "force"` to your component options. No promises after that.)-->

It can be used on the command line with:
```bash
matchbox-prerender index1.html index2.html --outDir ./dist
```

or as a Vite plugin with

```ts
import { matchboxPrerenderPlugin } from '@matchbox-wc/prerender/vite';
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
import { configureMatchbox, hydrate } from "matchbox-wc";

configureMatchbox({ hydrate: hydrate })
```

### Context
For many (arguably most) UI components, it's better to assemble composable parent and child pieces rather than having each parent component dictate exactly what its child components are. For instance:
```ts
component((items: string[]) => html`
  <ul>
    ${items.map((item, i) => html`<li>${i}. ${item}</li>`)}
  </ul>
`).register("list-parent", [{ items: [] }])
```
```ts
html`<list-parent .items=${["a", "b", "c"]}></list-parent>`
```
is less flexible than
```ts
component(() => html`
  <ul>
    <slot></slot>
  </ul>
`).register("list-parent")
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

First, somewhere outside of both components (probably at the top level of a file), create a context with `defineContext<T>()`. `T` can be any type, including a `State`.
```ts
const DemoContext = defineContext<MutableState<string | null>>("optional description");
```

To provide that context in the parent component, attach the handler returned by `rememberContextProvider` to the `@context-request` event.

```ts
component(() => {
  const selectedState = remember(() => mutableStateOf<string | null>(null))
  const contextProvider = rememberContextProvider(DemoContext, selectedState);
  return html`
    <ul role="listbox" @context-request=${contextProvider}>
      <slot></slot>
    </ul>
  `
}).register("demo-listbox")
```

Then to access that context in a child component, use `rememberContextConsumer` like a regular value.
```ts
component((value: string) => {
  const [selectedValue, setSelectedValue] = rememberContextConsumer(DemoContext);
  const isSelected = selectedValue === value;
  return html`
    <li 
      role="option" 
      aria-selected=${isSelected}
      @mouseenter=${() => setSelectedValue(value)}
    >${value}</li>
  `
}).register("demo-list-item",[{ value: "" }])
```

(For ergonomics, `rememberContextConsumer` returns a non-nullable type, even though it will be undefined if you use it without a provider above it. If you have scenarios where that is the intended behavior, cast the value to `T | undefined`.)


## Advanced features
### Cleaning up `remember`s
Matchbox exports a [symbol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) called `Disposable`.
If you return an object from `remember` and it has a field where the key is `Disposable` and the value is a function, that function will get called before any recalculation, and before the component gets destroyed. This allows you to clean up any long-running actions so they don't leak memory. 

For an example of how this is used, see `rememberLaunchedEffect`.

### Accessing the host element
In general, you shouldn't be manually reading or manipulating DOM in Matchbox, instead using declarative state for that. However, in some cases, it's significantly simpler to use the DOM manually. 

So, in a render function, you can use `rememberHost()` to get a handle to the host element of the component.

## Appendix

### Component configuration
The `component()` function takes an optional configuration object. Some of the parameters include:
- [`shadowRootMode`](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/mode)
- [`delegatesFocus`](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/delegatesFocus)
- [`adoptedStyleSheets`](#default-stylesheets)


### Setting attributes, properties, or children on a `${Component()}`
If you need to add attributes or properties to the host element of a component, or children to its light DOM, you can do so with `.with()`:
```ts
const AnonymousComponent = component(() => html`<div><slot></slot></div>`)

component(() => {
  return html`
    <div>
      ${AnonymousComponent().with({ class: "anonymous", style: "background-color: red;", "@click": () => console.log("clicked") }, html`<div>Slotted</div>`)}
    </div>
  `
})
```

### ``` html`` ``` templates
You can read more about `lit-html` tagged templates in [Lit's documentation](https://lit.dev/docs/templates/overview/), but some useful shorthand to know about:
- pass in **attributes** as HTML (in kebab-case):
  - `<button aria-label="${label}">Click Me</button>`
- pass in **properties** with a `.` in front of them (in camelCase):
  - `<input type="date" .valueAsDate=${new Date()}>`
- pass in **event listeners** with an `@` in front of them (usually kebab-case):
  - `<button @click=${(e) => console.log("clicked", e)}></button>`


### A brief outline of functional UI
Conceptually, you can think of a Matchbox component as a pure function where the inputs are the component's state, and the output is a new DOM tree. 
Any time a piece of state changes, the function gets rerun, so the component's DOM is always in sync with the state. (This is only conceptual—in practice, `lit-html` surgically updates only the parts of the DOM that have changed.)

Take this component as an example:
```ts
component((label: string, num: number) => {
  console.log("rerendered!")
  return html`<p>${label}: ${num}</p>`
})
```
For each instance of this component, any time that the `label` or `num` attributes get changed (whether that's manually in the DOM or JS, or by a parent web component), it will run the function, print `"rerendered!"` to the console, and update the internal DOM of the instance to reflect the new state.

If all that was possible was stateless functions, you could only change the state of the component tree by changing attributes on the top-level components. So to allow for component-scoped state, Matchbox lets you memoize state across renders using the `remember()` and `State` primitives.

> For further reading, Jetpack Compose's ["Thinking in Compose"](https://developer.android.com/develop/ui/compose/mental-model) guide is a little Android-specific in places but overall quite helpful for understanding declarative UI.

### Philosophy
Matchbox aims to make web components ergonomic enough to create large-scale web apps with.

Currently, web components seem to mostly be viewed as:
1. A way to create encapsulated components meant to be reused across multiple projects, or
2. A controller for small interactive portions of mostly static sites or micro-frontends.

Much of the native API surface of web components is aligned with these goals, most notably encapsulation-by-default.

But for any project larger than a handful of components, you want your components to interact with each other, to share styles, to nest and maintain ARIA compatibility, etc. You want components that are *not* encapsulated.

So Matchbox's API defaults to that. (Though it's still easy to make components encapsulated if necessary.) Also, in Matchbox, components are a single declarative function, rather than the boilerplate-heavy default of imperative callbacks and state and renders. 

It does all this while being extremely small and performant, keeping all the benefits of web components being so close to the platform.
(In fact, it's easier to use best practices for web components. Matchbox encourages HTML-like component construction with contexts, and has features like auto-generating Declarative Shadow DOM, so components are progressively enhanced by default rather than only running on the client side.)