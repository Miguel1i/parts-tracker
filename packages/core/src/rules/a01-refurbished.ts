import { refurbished, wordsRegex } from "../lexicon/words";
import { fold } from "../match/text";
import { slugText } from "../match/url";
import { pass, veto, type Rule } from "./context";

const ID = "A1-refurbished";
const RE = wordsRegex(refurbished);

/** A1: refurbished / used / outlet offers, from words in the title or URL, or JSON-LD condition. */
export const refurbishedRule: Rule = {
  id: ID,
  run({ ref, cand, offer, spec }) {
    if (spec.condition === "any" || RE.test(ref.text))
      return pass(ID, "the product allows refurbished");
    const m = `${cand.text} ${fold(slugText(offer.url))}`.match(RE);
    if (m) return veto(ID, `"${m[0]}" in the title or URL`, { word: m[0] });
    if (offer.condition && offer.condition !== "new")
      return veto(ID, `condition is ${offer.condition}`, { condition: offer.condition });
    return pass(ID, "new");
  },
};
