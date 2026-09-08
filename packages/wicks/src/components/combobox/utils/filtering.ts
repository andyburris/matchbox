const DIACRITICS = /\p{Diacritic}/gu;

function fold(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

/** How well `text` matches `query`: 0 for no match, higher for a better one. */
export function score(query: string, text: string): number {
  if (query === "") return 1;

  const haystack = fold(text);
  const at = haystack.indexOf(fold(query));

  if (at < 0) return 0;
  if (at === 0) return 3;
  return /[\s\-_/]/.test(haystack[at - 1]) ? 2 : 1;
}

/** Matching items, best first, keeping the original order among equal scores. */
export function rank<T>(query: string, items: readonly T[], key: (item: T) => string = String): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(query, key(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
