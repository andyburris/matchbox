/** Forces a default value that could be an attribute or a property (e.g. strings, numbers, booleans) to be a property. */
const PROP_ONLY = Symbol("matchbox.propertyOnly");

export type PropertyOnly<T> = { readonly [PROP_ONLY]: true; readonly value: T };

function isPropertyOnly(value: unknown): value is PropertyOnly<unknown> {
  return typeof value === "object" && value !== null && PROP_ONLY in value;
}

export function property<T>(value: T): PropertyOnly<T> {
  return { [PROP_ONLY]: true, value };
}

type TrueBoolErr = "matchbox: boolean attributes must default to false. Invert the name or mark as a property by wrapping this in `property()`";

/** 
 * In Lit, a `?attrname=${false}` statement removes the attribute, 
 * which is indistinguishable from it never being set in the first place. 
 * So if an attribute defaults to true, it, confusingly, will never be false.
 * So we disallow that.
 */
type AttrDefault<T> = [T] extends [boolean] ? false | TrueBoolErr : T;

export type DefaultsFor<A extends any[]> = {
  [K in keyof A]: Record<string, AttrDefault<A[K]> | PropertyOnly<A[K]>>;
};

export type PropDef = {
  readonly name: string;
  readonly attributeName: string;
  readonly value: unknown;
  readonly usesAttribute: boolean;
};

/** Flattens the defaults list into positional prop definitions. Runs once per component. */
export function readDefaults(defaults: readonly Record<string, unknown>[]): PropDef[] {
  return defaults.map((entry, index) => {
    const keys = Object.keys(entry);
    if (keys.length !== 1) {
      throw new Error(
        `[matchbox] defaults[${index}] must have exactly one key, but has ${keys.length}`
      );
    }

    const name = keys[0];
    const attributeName = toKebabCase(name);
    const raw = entry[name];

    if (isPropertyOnly(raw)) return { name, attributeName, value: raw.value, usesAttribute: false };

    // Same rule as AttrDefault, for callers who aren't using TypeScript
    if (raw === true) {
      throw new Error(
        `[matchbox] boolean prop "${name}" must default to false, or be wrapped in property()`
      );
    }

    const kind = typeof raw;
    const attributable = kind === "string" || kind === "number" || kind === "boolean";
    return { name, attributeName, value: raw, usesAttribute: attributable };
  });
}

function toKebabCase(camelCaseName: string): string {
  return camelCaseName.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}