let counter = 0;

/**
 * The element's id, assigning a unique generated one if it has none.
 */
export function ensureId(element: Element, label?: string): string {
  if (element.id) return element.id;

  // Ids are scoped to a node tree, so an element inside a shadow root is checked against it
  const scope = element.getRootNode() as Document | DocumentFragment;
  const next = () => `wx${label ? `-${label}` : ""}-${counter++}`;

  let candidate = next();
  while (scope.getElementById(candidate)) candidate = next();

  element.id = candidate;
  return candidate;
}
