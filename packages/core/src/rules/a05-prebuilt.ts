import { kitVetoCategories, kitWords, prebuilt, wordsRegex } from "../lexicon/words";
import { fold } from "../match/text";
import { slugText } from "../match/url";
import { pass, veto, type Rule } from "./context";

const ID = "A5-prebuilt";
const RE = wordsRegex(prebuilt);
const KIT = wordsRegex(kitWords);
/** "9800X3D + B850 …": a "+" joining the part to another part. */
const PLUS_PART =
  /\s\+\s*[^+]{0,40}?(?<![a-z0-9])(?:[abxz]\d{3}[a-z]?|rtx|rx\s?\d|ddr\d|\d+\s?gb|\d+\s?tb|cooler|ventoinha|placa|motherboard|ssd|ram|memoria)(?![a-z])/;

/** A5: complete PCs, laptops, bundles and kits of several parts, unless the product is one. */
export const prebuiltRule: Rule = {
  id: ID,
  run({ ref, cand, offer, target }) {
    if (RE.test(ref.text)) return pass(ID, "the product is a complete system");
    const text = `${cand.text} ${fold(slugText(offer.url))}`;
    const m = text.match(RE);
    if (m) return veto(ID, `"${m[0]}": a complete PC, laptop or bundle`, { word: m[0] });
    if (kitVetoCategories.includes(target.category) && !KIT.test(ref.text)) {
      const k = cand.text.match(KIT);
      if (k) return veto(ID, `"${k[0]}": a kit of several parts`, { word: k[0] });
    }
    const plus = cand.text.match(PLUS_PART);
    if (plus)
      return veto(ID, `"${plus[0].trim()}": sold together with another part`, {
        word: plus[0].trim(),
      });
    return pass(ID, "single part");
  },
};
