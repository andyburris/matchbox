export function styleSheet(text: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
}

/** Returns an empty sheet immediately; its rules arrive once the fetch resolves. */
export function fetchStyleSheet(url: string | URL): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((text) => sheet.replace(text))
    .catch((error) => console.error(`[matchbox] couldn't load stylesheet ${url}`, error));
  return sheet;
}

class UnsafeCSS {
  constructor(readonly text: string) {}
}

/** Marks a string as safe to interpolate into css``. Never pass it text a user controls. */
export function unsafeCSS(text: string): UnsafeCSS {
  return new UnsafeCSS(text);
}

export type CSSValue = number | UnsafeCSS;

/** Uses the raw template text, so CSS escapes like `content: "\2014"` need no doubled backslash. */
export function css(strings: TemplateStringsArray, ...values: CSSValue[]): CSSStyleSheet {
  return styleSheet(String.raw(strings, ...values.map(cssText)));
}

function cssText(value: CSSValue): string {
  if (typeof value === "number") return String(value);
  if (value instanceof UnsafeCSS) return value.text;
  throw new Error(`[matchbox] css\`\` only accepts numbers and unsafeCSS() values, but got: ${String(value)}`);
}
