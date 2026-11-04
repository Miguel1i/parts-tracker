/** Maps category text (breadcrumbs, JSON-LD category, URL segments, products.category) to a Category. */
import { categoryWords } from "../lexicon/words";
import { fold } from "./text";
import { categories, type Category } from "./types";

export type HintCategory = Category | "pc";

const ANYWHERE = categoryWords.map(
  ([cat, words]) => [cat, new RegExp(`(?<![a-z0-9])(?:${words.join("|")})(?![a-z0-9])`)] as const,
);
const AT_START = categoryWords.map(
  ([cat, words]) => [cat, new RegExp(`^(?:${words.join("|")})(?![a-z0-9])`)] as const,
);

/** Category of a short hint (a breadcrumb segment), or null. */
export function categoryOfHint(hint: string): HintCategory | null {
  const t = fold(hint).replace(/[-_/>|]+/g, " ");
  if (!t || t.length > 60) return null;
  for (const [cat, re] of ANYWHERE) if (re.test(t)) return cat;
  return null;
}

/** Category of a URL path segment ("processador-amd-ryzen-7-…"): only its first words count. */
export function categoryOfSegment(segment: string): HintCategory | null {
  const t = fold(segment)
    .replace(/[-_.+]+/g, " ")
    .trim();
  for (const [cat, re] of AT_START) if (re.test(t)) return cat;
  return null;
}

/** Normalizes a free-text product category (`products.category`) to a Category. */
export function toCategory(value: string | null | undefined): Category {
  if (!value) return "other";
  const v = fold(value);
  if ((categories as readonly string[]).includes(v)) return v as Category;
  const hint = categoryOfHint(v);
  return hint && hint !== "pc" ? hint : "other";
}
