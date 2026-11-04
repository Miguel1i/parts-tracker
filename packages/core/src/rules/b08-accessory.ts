import { accessoryWords, forPhrases, wordsRegex } from "../lexicon/words";
import { candidateForms } from "../match/text";
import { pass, veto, type Rule } from "./context";

const ID = "B8-accessory";
const ACCESSORY = wordsRegex(accessoryWords);
const FOR = wordsRegex(forPhrases, "g");

/**
 * B8: an accessory for the part rather than the part: the part's model follows a
 * "for / para / compatible with" phrase, or the title starts with an accessory word
 * ("Backplate … RTX 5070 Ti"). Accessory words after the model ("… com cabos") are fine.
 */
export const accessoryRule: Rule = {
  id: ID,
  run({ ref, cand, sim }) {
    const models = sim.found.filter((t) => t.cls === "model").map((t) => t.form);
    for (const m of cand.text.matchAll(FOR)) {
      const after = cand.text.slice(m.index! + m[0].length, m.index! + m[0].length + 60);
      const forms = candidateForms(after);
      const hit = models.find((f) => forms.has(f));
      if (hit)
        return veto(ID, `"${m[0]} … ${hit}": an accessory for the part`, {
          phrase: m[0],
          model: hit,
        });
    }
    const acc = cand.text.match(ACCESSORY);
    if (acc && !ACCESSORY.test(ref.text)) {
      const first = sim.found[0];
      const firstAt = first ? cand.text.indexOf(first.token) : -1;
      if (firstAt === -1 || acc.index! < firstAt)
        return veto(ID, `"${acc[0]}": an accessory, not the part`, { word: acc[0] });
    }
    return pass(ID, "not an accessory");
  },
};
