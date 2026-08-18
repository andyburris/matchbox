
/** Members lit marks @internal. Mirrors the declarations in @matchbox/core's hydrate.ts. */
type LitPart = { readonly type: number };

type LitChildPart = LitPart & {
  startNode: Comment;
  endNode: Node | null;
};

type PartAccess = {
  committedValue(part: object): unknown;
  parts(value: unknown): (LitPart | undefined)[] | null;
};

/**
 * Lit renames every `_$` field in production builds, and the page's copy of lit isn't ours,
 * so learn the two names we need from a root part — where the committed value is always a
 * TemplateInstance.
 */
function learn(rootPart: object): PartAccess | null {
  for (const [partKey, value] of Object.entries(rootPart)) {
    const instanceKey = templateInstanceKey(value);
    if (instanceKey === null) continue;

    return {
      committedValue: (part) => (part as Record<string, unknown>)[partKey],
      parts: (value) => {
        if (typeof value !== 'object' || value === null) return null;
        const found = (value as Record<string, unknown>)[instanceKey];
        return Array.isArray(found) ? (found as (LitPart | undefined)[]) : null;
      },
    };
  }
  return null;
}

/** A TemplateInstance is the only thing holding both a parts array and a template —
 *  returns the key that array lives under. */
function templateInstanceKey(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;

  let partsKey: string | null = null;
  let hasTemplate = false;
  for (const [key, member] of Object.entries(value)) {
    if (Array.isArray(member)) partsKey = key;
    else if (typeof member === 'object' && member !== null && 'el' in member && 'parts' in member) {
      hasTemplate = true;
    }
  }
  return hasTemplate ? partsKey : null;
}


const CHILD_PART = 2;

/** Comment data distinguishing part boundaries from lit's static empty comments. */
const CLOSE = '/';
const ITEM_OPEN = '[';
const ITEM_CLOSE = ']';

export function collectHydratableRoots(document: Document): ShadowRoot[] {
  return collectShadowRoots(document).filter(
    (root) => (root as unknown as { _$litPart$?: object })._$litPart$ !== undefined,
  );
}

/**
 * Mark the end of Lit parts with a comment. 
 * 
 * For example, if two text nodes controlled by different Lit parts are next to each other,
 * when the prerendered HTML gets parsed, 
 * they will be combined into a single text node unless a comment demarcates them.
 */
export function markPartExtents(roots: readonly ShadowRoot[]): void {
  let access: PartAccess | null = null;

  for (const root of roots) {
    const rootPart = (root as unknown as { _$litPart$?: object })._$litPart$;
    if (rootPart === undefined) continue;

    access ??= learn(rootPart);
    if (access === null) continue;

    markValue(access.committedValue(rootPart), access);
  }
}


/** 
 * Recursively mark the end of any child parts.
 * Also edit the array item markers to help the hydrator
 */
function markValue(committed: unknown, access: PartAccess): void {
  if (Array.isArray(committed)) {
    for (const item of committed as LitChildPart[]) {
      // Item markers are indistinguishable from the static empty
      // comment lit emits when a template's last string is empty, so rewrite them
      item.startNode.data = ITEM_OPEN;
      if (isComment(item.endNode)) item.endNode.data = ITEM_CLOSE;
      markValue(access.committedValue(item), access);
    }
    return;
  }

  const parts = access.parts(committed);
  if (parts === null) return;
  for (const part of parts) {
    if (part === undefined || part.type !== CHILD_PART) continue;
    const child = part as LitChildPart;
    markValue(access.committedValue(child), access);
    closeChildPart(child);
  }
}

/** Inserts the closing marker */
function closeChildPart(part: LitChildPart): void {
  const parent = part.startNode.parentNode;
  if (parent === null) return;

  const close = part.startNode.ownerDocument.createComment(CLOSE);
  parent.insertBefore(close, part.endNode);   // a null endNode appends, which is correct
}

/** Check nodeType instead of instanceof — happy-dom's Comment isn't the same as the ususal one. */
function isComment(node: Node | null): node is Comment {
  return node !== null && node.nodeType === 8;
}

export function collectShadowRoots(root: ParentNode, found: ShadowRoot[] = []): ShadowRoot[] {
  for (const element of root.querySelectorAll('*')) {
    if (!element.shadowRoot) continue;
    found.push(element.shadowRoot);
    collectShadowRoots(element.shadowRoot, found);   // nested components
  }
  return found;
}