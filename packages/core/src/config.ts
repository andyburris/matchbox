import { type HydrateDOM } from "./hydrate";


export type MatchboxOptions = {
  defaultAdoptedStylesheets: CSSStyleSheet[],
  hydrate: HydrateDOM | null,
}

export let activeMatchboxOptions: MatchboxOptions = {
  defaultAdoptedStylesheets: [],
  hydrate: null,
}

export function configureMatchbox(options: Partial<MatchboxOptions>) {
  activeMatchboxOptions = { ...activeMatchboxOptions, ...options };

  // flag for prerender build step to pick up
  if (activeMatchboxOptions.hydrate) (globalThis as any).__matchboxHydration = true;
}