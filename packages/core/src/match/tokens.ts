/** Reference tokens, their weights, and the weighted title similarity of A7. */
import { brands, fillerWords, variantWords, wordsRegex } from "../lexicon/words";
import { ATTRIBUTE_SPANS } from "./attributes";
import { candidateForms, normalizeTitle, tokenize } from "./text";
import type { Category, MatchTarget } from "./types";

export type TokenClass = "model" | "variant" | "brand" | "plain" | "filler";

export const TOKEN_WEIGHTS: Record<TokenClass, number> = {
  model: 3,
  variant: 2,
  brand: 2,
  plain: 1,
  filler: 0.25,
};

export interface RefToken {
  token: string;
  form: string;
  cls: TokenClass;
  weight: number;
}

const FILLER = new Set(fillerWords);
const COMMON_VARIANTS = [
  "ti",
  "super",
  "xt",
  "xtx",
  "gre",
  "plus",
  "pro",
  "max",
  "neo",
  "ultra",
  "evo",
  "oc",
];

/** Brand aliases with spaces or punctuation, rewritten to one token on both sides. */
const BRAND_PHRASES = Object.entries(brands).flatMap(([key, aliases]) =>
  aliases
    .filter((a) => /[^a-z0-9]/.test(a))
    .map(
      (a) =>
        [
          new RegExp(`(?<![a-z0-9])${a.replace(/[.*+?^${}()|[\]\\!]/g, "\\$&")}(?![a-z0-9])`, "g"),
          key,
        ] as const,
    ),
);
const BRAND_KEYS = new Map<string, string>();
for (const [key, aliases] of Object.entries(brands))
  for (const a of aliases) BRAND_KEYS.set(a.replace(/[^a-z0-9]/g, ""), key);
const BRAND_ANY = wordsRegex(
  Object.values(brands)
    .flat()
    .map((a) => a.replace(/[.*+?^${}()|[\]\\!]/g, "\\$&")),
  "gi",
);

/** `normalizeTitle` plus brand phrases folded to one token ("be quiet!" → "bequiet"). */
export function matchText(input: string | null | undefined): string {
  let s = normalizeTitle(input);
  for (const [re, key] of BRAND_PHRASES) s = s.replace(re, key);
  return s;
}

/** Brand keys named in a text. */
export function detectBrands(text: string): string[] {
  const out = new Set<string>();
  for (const m of matchText(text).matchAll(BRAND_ANY)) {
    const key = BRAND_KEYS.get(m[0].toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (key) out.add(key);
  }
  return [...out];
}

/** True for a key from the brand list (as returned by `brandKey`). */
export function isKnownBrand(key: string): boolean {
  return key in brands;
}

/** Brand list key for a brand name, or its compact form when the brand isn't listed. */
export function brandKey(brand: string | null | undefined): string | null {
  if (!brand) return null;
  const c = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  return BRAND_KEYS.get(c) ?? (c || null);
}

function stripAttributes(text: string): string {
  let s = text;
  for (const re of ATTRIBUTE_SPANS) s = s.replace(re, " ");
  return s;
}

export function classify(form: string, category: Category): TokenClass {
  if (BRAND_KEYS.has(form)) return "brand";
  if (FILLER.has(form)) return "filler";
  if (variantWords[category].includes(form) || COMMON_VARIANTS.includes(form)) return "variant";
  if (/\d/.test(form)) {
    if (/[a-z]/.test(form) || /^\d{3,}$/.test(form)) return "model";
    return "variant";
  }
  return "plain";
}

/** Tokens of the query (all classes) plus the model tokens of the full name. */
export function referenceTokens(
  target: Pick<MatchTarget, "name" | "query" | "category">,
): RefToken[] {
  const out = new Map<string, RefToken>();
  const add = (token: string, onlyModels: boolean) => {
    const form = token.replace(/[^a-z0-9]/g, "");
    if (!form || out.has(form)) return;
    const cls = classify(form, target.category);
    if (onlyModels && cls !== "model") return;
    out.set(form, { token, form, cls, weight: TOKEN_WEIGHTS[cls] });
  };
  for (const t of tokenize(stripAttributes(matchText(target.query || target.name)))) add(t, false);
  if (target.query) for (const t of tokenize(stripAttributes(matchText(target.name)))) add(t, true);
  return [...out.values()];
}

export interface Similarity {
  sim: number;
  found: RefToken[];
  missing: RefToken[];
  missingModels: RefToken[];
}

export function titleSimilarity(ref: RefToken[], candidateText: string): Similarity {
  const forms = candidateForms(matchText(candidateText));
  const found: RefToken[] = [];
  const missing: RefToken[] = [];
  for (const t of ref) (forms.has(t.form) ? found : missing).push(t);
  const total = ref.reduce((s, t) => s + t.weight, 0);
  const got = found.reduce((s, t) => s + t.weight, 0);
  return {
    sim: total ? got / total : 0,
    found,
    missing,
    missingModels: missing.filter((t) => t.cls === "model"),
  };
}
