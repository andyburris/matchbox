import { nothing, render, type RenderOptions, type TemplateResult } from 'lit-html';
import { getCommittedValue, setChildPartValue, setCommittedValue } from 'lit-html/directive-helpers.js';
import { _$LH } from 'lit-html/private-ssr-support.js';

export const { ChildPart, ElementPart, TemplateInstance, isIterable, getAttributePartCommittedValue } =
    _$LH as unknown as {
        ChildPart: new (
            startNode: Node,
            endNode: Node | null,
            parent: LitTemplateInstance | LitChildPart | undefined,
            options: RenderOptions,
        ) => LitChildPart;
        ElementPart: new (element: Node, parent: LitTemplateInstance, options: RenderOptions) => LitPart;
        TemplateInstance: new (template: LitTemplate, parent: LitChildPart) => LitTemplateInstance;
        isIterable: (value: unknown) => value is Iterable<unknown>;
        getAttributePartCommittedValue: (part: LitPart, value: unknown, index?: number) => unknown;
    };

/** Lit never exports Template, so borrow its nominal type from the constructor. */
export type LitTemplate = {
    readonly el: HTMLTemplateElement;
    readonly parts: readonly LitTemplatePart[];
};

export type LitTemplatePart = {
    readonly type: number;
    readonly index: number;
    readonly name: string;
    readonly strings: readonly string[];
    readonly ctor: new (
        element: Node,
        name: string,
        strings: readonly string[],
        parent: LitTemplateInstance,
        options: RenderOptions,
    ) => LitPart;
};

export type LitPart = { readonly type: number; readonly strings?: readonly string[] };

export type LitChildPart = LitPart & {
    readonly startNode: Node;        // public getters, kept through mangling
    readonly endNode: Node | null;
};

export type LitEditablePart = LitPart & {
    readonly element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLDetailsElement;
    readonly name: 'value' | 'checked' | 'open';
};

declare const instanceBrand: unique symbol;
/** Opaque — every field lit puts on an instance is renamed in production builds, so go
 *  through templateOf/partsOf instead of reaching in. */
export type LitTemplateInstance = { readonly [instanceBrand]?: never };



// Template-level part kinds, different from `PartType` which distinguishes property/boolean/event (and which `templatePart.ctor` already encodes)
export const ATTRIBUTE_PART = 1;
export const CHILD_PART = 2;
export const ELEMENT_PART = 6;

export const SHOW_ELEMENT_AND_COMMENT = 129;

export const internalsAvailable =
    typeof TemplateInstance === 'function' &&
    typeof ChildPart === 'function' &&
    typeof ElementPart === 'function';
type InstanceAccess = {
  template(instance: LitTemplateInstance): LitTemplate;
  parts(instance: LitTemplateInstance): (LitPart | undefined)[];
};

const templates = new WeakMap<TemplateStringsArray, LitTemplate>();

/**
 * Lit only builds a Template while rendering, and `_$getTemplate` is renamed in production.
 * Render a valueless copy into a throwaway div: every part receives `undefined`, so no
 * directive resolves and no listener attaches. One clone per unique template, not per component.
 */
export function templateFor(result: TemplateResult): LitTemplate | null {
    const cached = templates.get(result.strings);
    if (cached !== undefined) return cached;

    const probe = document.createElement('div');
    render({ ...result, values: [] }, probe);

    const rootPart = (probe as unknown as { _$litPart$?: LitChildPart })._$litPart$;
    if (rootPart === undefined) return null;

    const template = templateOf(getCommittedValue(rootPart as never) as LitTemplateInstance);
    if (template !== null) templates.set(result.strings, template);
    return template;
}


/** Production lit renames every `_$` field, so locate the two we need by shape, once. */
function learn(instance: object): InstanceAccess | null {
  let templateKey: string | undefined;
  let partsKey: string | undefined;

  for (const [key, value] of Object.entries(instance)) {
    if (Array.isArray(value)) partsKey = key;
    else if (isTemplate(value)) templateKey = key;
  }
  if (templateKey === undefined || partsKey === undefined) return null;

  const read = (i: LitTemplateInstance, key: string) => (i as unknown as Record<string, unknown>)[key];
  return {
    template: (i) => read(i, templateKey) as LitTemplate,
    parts: (i) => read(i, partsKey) as (LitPart | undefined)[],
  };
}

function isTemplate(value: unknown): value is LitTemplate {
    return typeof value === 'object' && value !== null && 'el' in value && 'parts' in value;
}

let access: InstanceAccess | null = null;

export function partsOf(instance: LitTemplateInstance): (LitPart | undefined)[] | null {
    return (access ??= learn(instance))?.parts(instance) ?? null;
}

export function templateOf(instance: LitTemplateInstance): LitTemplate | null {
    return (access ??= learn(instance))?.template(instance) ?? null;
}

/** Records what a part now holds, without writing to the DOM. */
export function recordPartValue(part: LitPart, value: unknown): void {
    setCommittedValue(part as never, value);
}

/** Commits a single-expression part's value for real. `setChildPartValue` is
 *  `(part, value, parent = part) => part._$setValue(value, parent)`, which is the right
 *  call for any single-expression part — it's only *typed* for ChildPart. */
export function commitPartValue(part: LitPart, value: unknown): void {
    setChildPartValue(part as never, value);
}

/** The key `getAttributePartCommittedValue` installs to capture the value instead of writing
 *  it. lit-ssr throws those parts away; we keep ours, so it has to come back off — and it's
 *  the same key on every part, so finding it once is enough. */
let commitOverrideKey: string | undefined;

/** Resolves a multi-binding attribute's value without writing it. The helper installs an
 *  own commit-override to capture the value; lit-ssr discards the part afterwards but we
 *  keep using ours, so strip whatever key it added. */
export function attributeValue(part: LitPart, values: readonly unknown[], index: number): unknown {
    const target = part as unknown as Record<string, unknown>;
    const before = commitOverrideKey === undefined ? new Set(Object.keys(target)) : null;

    const value = getAttributePartCommittedValue(part, values, index);

    if (before !== null) commitOverrideKey = Object.keys(target).find((key) => !before.has(key));
    if (commitOverrideKey !== undefined) delete target[commitOverrideKey];

    return value;
}
/** Properties never serialize, and `attributeValue` deliberately skips the DOM, so a
 *  property part with static string portions has to be written by hand. */
export function commitProperty(part: LitPart, value: unknown): void {
    const target = part as unknown as { element: Record<string, unknown>; name: string };
    target.element[target.name] = value === nothing ? undefined : value;
}
