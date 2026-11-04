/** B12: stock state from schema.org availability or shop text. */
import { inStockWords, outOfStockWords, preorderWords, wordsRegex } from "../lexicon/words";
import { fold } from "../match/text";
import type { Stock } from "../match/types";

const PREORDER = wordsRegex(preorderWords);
const OUT = wordsRegex(outOfStockWords);
const IN = wordsRegex(inStockWords);

export function stockFromAvailability(value: string | undefined): Stock | null {
  if (!value) return null;
  const v = value.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
  if (/preorder|presale|backorder/.test(v)) return "preorder";
  if (/outofstock|soldout|discontinued/.test(v)) return "out_of_stock";
  if (/instock|onlineonly|limitedavailability|instoreonly/.test(v)) return "in_stock";
  return null;
}

export function stockFromText(text: string | undefined): Stock | null {
  if (!text) return null;
  const t = fold(text);
  if (PREORDER.test(t)) return "preorder";
  if (OUT.test(t)) return "out_of_stock";
  if (IN.test(t)) return "in_stock";
  return null;
}

/** "Pré-venda" in the title wins over a structured InStock (shops often mark preorders InStock). */
export function preorderInTitle(title: string | undefined): boolean {
  return !!title && PREORDER.test(fold(title));
}
