import type { RenderOptions, TemplateResult } from 'lit-html';
import { isPrimitive } from 'lit-html/directive-helpers.js';
import { PartType } from 'lit-html/directive.js';
import {
    ATTRIBUTE_PART, attributeValue, CHILD_PART, ChildPart, commitPartValue, commitProperty, ELEMENT_PART, ElementPart, internalsAvailable,
    isIterable, partsOf, recordPartValue, SHOW_ELEMENT_AND_COMMENT, templateFor, TemplateInstance,
    templateOf,
    type LitChildPart, type LitEditablePart, type LitPart, type LitTemplateInstance,
} from './litInternals';

export type HydrateDOM = typeof hydrate

/** A value the user changed before JS arrived, and the property to put it back on if an
 *  earlier sync's re-render committed the component's stale value over it. */
type UserEdit = { readonly el: Element; readonly property: string; readonly value: unknown };
type HydrationContext = { 
    readonly options: RenderOptions; 
    // Keep track of the elements that were edited by the user before the JS arrived
    // and who need their component state synced up to that
    readonly unsynced: UserEdit[];
 };


/** Comment data the prerender writes to record where each part's content ends. */
const CLOSE = '/';
const ITEM_OPEN = '[';
const ITEM_CLOSE = ']';

/** Lit re-randomizes its marker suffix per execution, so the prerender's markers never
 *  match this run's exactly — match the prefix instead of `_$LH.markerMatch`. */
const LIT_MARKER_PREFIX = '?lit$';


export function hydrate(
    result: TemplateResult,
    root: ShadowRoot,
    options: RenderOptions = {},
): boolean {
    const bound = bindToShadowRoot(result, root, options);
    // If the binding doesn't work, the caller needs to clear and render fresh
    if (bound === null) return false;

    const unsynced: UserEdit[] = [];
    if (!commitHydrated(bound.instance, result.values, { options, unsynced })) return false;

    recordPartValue(bound.rootPart, bound.instance);
    (root as unknown as { _$litPart$?: LitChildPart })._$litPart$ = bound.rootPart;

    // After hydration completes b/c these handlers call setState synchronously and would re-render against a half-bound instance.
    for (const { el, property, value } of unsynced) {
        (el as unknown as Record<string, unknown>)[property] = value;
        syncComponentState(el);
    }

    return true;
}

/**
 * Replaces the Update step in the [Lit rendering process](https://github.com/lit/lit/blob/main/dev-docs/design/how-lit-html-works.md#summary-of-lit-html-rendering-phases)
 *
 * For most parts it does nothing, since the prerendered DOM should already hold the right content
 * But events and properties don't serialize, so those have to be committed.
 *
 * If hydration fails, returns false so the caller knows to render normally
 */
function commitHydrated(
    instance: LitTemplateInstance,
    values: readonly unknown[],
    ctx: HydrationContext,
): boolean {
    let i = 0;
    const parts = partsOf(instance); 
    if (parts === null) return false;
    for (const part of parts) {
        if (part !== undefined) {
            if (part.strings !== undefined) {
                // Multi-binding attribute interpolation — the DOM already carries the resolved
                // string, so resolve the value without writing it. Properties don't serialize,
                // so those still need writing by hand.
                const value = attributeValue(part, values, i);
                if (part.type === PartType.PROPERTY) commitProperty(part, value);
                i += part.strings.length - 2;
            } else if (isChildPart(part)) {
                if (!hydrateChildPart(part, values[i], ctx)) return false;
            } else if (isUserEditable(part)) {
                // Seed from the DOM, not the template: the user may have typed before JS
                // arrived. Committing would overwrite it, reset the caret, and abort any
                // in-progress IME composition.
                const el = part.element;
                const current =
                    part.name === 'open' ? (el as HTMLDetailsElement).open
                    : part.name === 'checked' ? (el as HTMLInputElement).checked
                    : (el as HTMLInputElement).value;
                if (current !== values[i]) {
                    ctx.unsynced.push({ el, property: part.name, value: current });
                }
                recordPartValue(part, current);
            } else {
                // PropertyPart, EventPart, ElementPart: listeners, properties and directives
                // don't serialize, so these commit for real.
                commitPartValue(part, values[i]);
            }
        }
        i++;
    }
    return true;
}

function isUserEditable(part: LitPart): part is LitEditablePart {
    const candidate = part as Partial<LitEditablePart>;
    const el = candidate.element;


    if (candidate.name === 'open') {
        return part.type === PartType.BOOLEAN_ATTRIBUTE && el instanceof HTMLDetailsElement;
    }
    if (candidate.name !== 'value' && candidate.name !== 'checked') return false;
    return (
        part.type === PartType.PROPERTY &&
        (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement)
    );
}

function isChildPart(part: LitPart): part is LitChildPart {
    return part.type === PartType.CHILD;
}

// Hydrate the dynamic parts of a tagged template (anything in ${})
function hydrateChildPart(
    part: LitChildPart,
    value: unknown,
    ctx: HydrationContext,
): boolean {
    // Primitives have to run before the array branch since every text binding is iterable.
    if (isPrimitive(value)) {
        // Primitive text: seed from the existing text node so lit takes its in-place
        // `.data` fast path instead of replacing the node.
        const textNode = part.startNode.nextSibling;
        if (textNode !== null && textNode.nodeType === Node.TEXT_NODE) {
            recordPartValue(part, (textNode as Text).data);
        }
        commitPartValue(part, value);
        return true;
    }

    // Run the bind process for any nested ${html` ... `} templates
    if ((value as { _$litType$?: unknown })._$litType$ !== undefined) {
        const result = value as TemplateResult;
        const template = templateFor(result);
        if (!template) return false;
        const nestedInstance = new TemplateInstance(template, part);
        const succeeded = bindInstance(nestedInstance, part.startNode, ctx.options);
        if (!succeeded) return false;
        if (!commitHydrated(nestedInstance, result.values, ctx)) return false;
        // Seeding this is what lets later updates reuse the instance rather than re-cloning
        recordPartValue(part, nestedInstance);
        return true;
    }

    // Each item is bracketed by its own markers in the prerendered output, so they bind in place
    if (isIterable(value)) return hydrateItems(part, value, ctx);

    // A DOM node or an unresolved directive — neither serializes, so commit for real
    commitPartValue(part, value);
    return true;
}

/**
 * Handles the bind and hydrate process for parts inside a ${[]}. 
 * Uses the markers from the prerenderer.
 */
function hydrateItems(
    part: LitChildPart,
    values: Iterable<unknown>,
    ctx: HydrationContext,
): boolean {
    const itemParts: LitChildPart[] = [];
    let cursor = part.startNode.nextSibling;

    for (const value of values) {
        if (!isMarker(cursor, ITEM_OPEN)) return false;
        const close = findCloseMarker(cursor);
        if (close === null) return false;

        const itemPart = new ChildPart(cursor, close, part, ctx.options);
        if (!hydrateChildPart(itemPart, value, ctx)) return false;

        itemParts.push(itemPart);
        cursor = close.nextSibling;
    }

    // If the client and the prerender have different numbers of items, bail
    if (cursor !== part.endNode) return false;

    recordPartValue(part, itemParts);
    return true;
}

function isMarker(node: Node | null, data: string): node is Comment {
    return node !== null && node.nodeType === Node.COMMENT_NODE && (node as Comment).data === data;
}

/**
 * Brings component state in line with a value the user edited before JS arrived, by
 * dispatching the event their interaction would have fired. Runs the developer's own
 * @input/@change handler, so state lands where it would have if they'd typed post-load.
 */
function syncComponentState(el: Element): void {
    const init = { bubbles: true, composed: true };
    if (el instanceof HTMLDetailsElement) return void el.dispatchEvent(new Event('toggle', init));
    if (el instanceof HTMLDialogElement) return void el.dispatchEvent(new Event('close', init));
    el.dispatchEvent(new Event('input', init));
    el.dispatchEvent(new Event('change', init));
}

/**
 * Runs bindInstance to a shadow root, skipping any injected styles
 */
function bindToShadowRoot(
    result: TemplateResult,
    root: ShadowRoot,
    options: RenderOptions,
): { rootPart: LitChildPart; instance: LitTemplateInstance } | null {
    // If Lit's private internals aren't shaped as expected, fall back to a regular render
    if (!internalsAvailable) return null;

    // Since the prerendering process inserts other elements (for styles),
    // find the actual start that gets rendered
    const marker = findRootMarker(root);
    if (marker === null) return null;

    // we need an empty ChildPart to run _$getTemplate so we can access the template created in the Prepare step
    // we then reuse it as the root of the template instance
    const rootPart = new ChildPart(marker, null, undefined, options);
    const template = templateFor(result);
    if (!template) return null;
    const instance = new TemplateInstance(template, rootPart);
    const succeeded = bindInstance(instance, marker, options);
    if (!succeeded) return null;

    return { rootPart, instance };
}

/**
 * Takes an instance of a Lit template and fills its parts array with pointers to live nodes.
 * Replaces the Create step in the [Lit rendering process](https://github.com/lit/lit/blob/main/dev-docs/design/how-lit-html-works.md#summary-of-lit-html-rendering-phases)
 * Instead of creating a fresh instance of the template created in the Prepare process we bind it to the existing prerendered instance. 
 */
function bindInstance(
    instance: LitTemplateInstance,
    startNode: Node,
    options: RenderOptions,
): boolean {
    const template = templateOf(instance); 
    const instanceParts = partsOf(instance)
    if (template === null || instanceParts === null) return false;
    const parts = template.parts;

    // Create a walker for the live DOM and one for the newly-rendered template DOM
    const live = document.createTreeWalker(startNode.parentNode!, SHOW_ELEMENT_AND_COMMENT);
    const templateReference = document.createTreeWalker(template.el.content, SHOW_ELEMENT_AND_COMMENT);
    live.currentNode = startNode; // template content starts at the marker's next node

    let node = live.nextNode();
    let expected = templateReference.nextNode();
    let nodeIndex = 0;
    let partIndex = 0;
    let templatePart = parts[0];

    // Walk the live DOM and the template DOM in lockstep. Any difference causes a bail.
    while (templatePart !== undefined) {
        if (node === null || expected === null) return false;
        if (node.nodeType !== expected.nodeType) return false;
        if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node as Element).localName !== (expected as Element).localName
        ) {
            return false;
        }

        if (nodeIndex === templatePart.index) {
            let part: LitPart | undefined;
            if (templatePart.type === CHILD_PART) {
                // Lit's _clone uses node.nextSibling because its fragment holds no committed content yet. 
                // Since we have content already, we add a marker in the prerender process that we search for instead
                const close = findCloseMarker(node);
                if (close === null) return false;
                part = new ChildPart(node, close, instance, options);
                live.currentNode = close;
            } else if (templatePart.type === ATTRIBUTE_PART) {
                part = new templatePart.ctor(
                    node,
                    templatePart.name,
                    templatePart.strings,
                    instance,
                    options,
                );
            } else if (templatePart.type === ELEMENT_PART) {
                part = new ElementPart(node, instance, options);
            }
            instanceParts.push(part);
            templatePart = parts[++partIndex];
        }

        if (nodeIndex !== templatePart?.index) {
            node = live.nextNode();
            expected = templateReference.nextNode();
            nodeIndex++;
        }
    }
    return true;
}

/**
 * Find the empty comment marker that Lit inserts before every root ChildPart's start
 * Both the client render and the prerendered output have one, but the prerendered version might have style elements before it
 */
function findRootMarker(container: ShadowRoot): Comment | null {
    for (let node = container.firstChild; node !== null; node = node.nextSibling) {
        if (node.nodeType === Node.COMMENT_NODE) return node as Comment;
        if (node.nodeType === Node.TEXT_NODE) continue;
        if ((node as Element).hasAttribute?.('data-mb-style')) continue;
        return null;
    }
    return null;
}

/**
 * Finds the end comment marker (for a corresponding open marker) 
 * that the prerenderer inserts every ChildPart's end.
 * (Necessary to prevent merging prerendered nodes, see prerender for more details.)
 */
function findCloseMarker(open: Node): Comment | null {
    let depth = 0;

    for (let node = open.nextSibling; node !== null; node = node.nextSibling) {
        if (node.nodeType !== Node.COMMENT_NODE) continue;

        const data = (node as Comment).data;
        if (data.startsWith(LIT_MARKER_PREFIX) || data === ITEM_OPEN) {
            depth++;
        } else if (data === CLOSE || data === ITEM_CLOSE) {
            if (depth === 0) return node as Comment;
            depth--;
        }
    }
    return null;
}
