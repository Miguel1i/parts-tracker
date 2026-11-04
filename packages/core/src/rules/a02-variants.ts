import { variantNoise, variantWords } from "../lexicon/words";
import { tokenize } from "../match/text";
import type { Category } from "../match/types";
import { pass, veto, type Rule } from "./context";

const ID = "A2-variant";
const NOISE = variantNoise.map((p) => new RegExp(`(?<![a-z0-9])${p}`, "g"));

/** Variant words of a category named in a text, after removing "80 Plus", "Max Boost", … */
export function variantSet(text: string, category: Category): Set<string> {
  let s = text;
  for (const re of NOISE) s = s.replace(re, " ");
  const vocab = new Set(variantWords[category]);
  return new Set(tokenize(s).filter((t) => vocab.has(t)));
}

/** A2: the variant-word sets must match (5070 vs 5070 Ti, 990 EVO vs 990 EVO Plus). */
export const variantRule: Rule = {
  id: ID,
  run({ ref, cand, target, stage }) {
    const want = variantSet(ref.text, target.category);
    const got = variantSet(cand.text, target.category);
    const extra = [...got].filter((v) => !want.has(v));
    // Link text is often truncated, so a link only fails on variants the product doesn't have.
    const missing = stage === "link" ? [] : [...want].filter((v) => !got.has(v));
    if (extra.length || missing.length) {
      const parts = [
        extra.length ? `has ${extra.join(", ")}` : "",
        missing.length ? `lacks ${missing.join(", ")}` : "",
      ].filter(Boolean);
      return veto(ID, `variant differs: ${parts.join("; ")}`, {
        extra: extra.join(","),
        missing: missing.join(","),
      });
    }
    return pass(ID, want.size ? `variants match: ${[...want].join(", ")}` : "no variant words");
  },
};
