export type MatchboxOptions = {
  defaultAdoptedStylesheets: CSSStyleSheet[]
}

export let activeMatchboxOptions: MatchboxOptions = {
  defaultAdoptedStylesheets: [],
}

export function configureMatchbox(options: Partial<MatchboxOptions>) {
  activeMatchboxOptions = { ...activeMatchboxOptions, ...options };
}