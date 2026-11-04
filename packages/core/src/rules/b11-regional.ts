import { mainsCategories } from "../lexicon/words";
import { pass, result, veto, type Rule } from "./context";

const ID = "B11-regional";

/** B11: UK-plug mains products at non-UK shops veto; "import" / "US version" costs points. */
export const regionalRule: Rule = {
  id: ID,
  run({ target, cand, merchant, stage }) {
    const uk = merchant.country?.toUpperCase() === "GB";
    if (cand.attrs.ukPlug && mainsCategories.includes(target.category) && !uk)
      return veto(ID, "UK plug at a non-UK shop");
    if (cand.attrs.imported && stage !== "link")
      return result(ID, "penalty", -10, "imported / regional version");
    return pass(ID, "no regional marker");
  },
};
