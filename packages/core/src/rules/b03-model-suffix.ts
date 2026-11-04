import { tokenize } from "../match/text";
import { pass, veto, type Rule } from "./context";

const ID = "B3-model-suffix";

/**
 * B3: the offer has a sibling of a missing model token: same number, other suffix
 * (9800X vs 9800X3D, 7600 vs 7600X, 14600K vs 14600KF, B850 vs B850M). A7 also vetoes a
 * missing model token; this rule names the sibling as evidence.
 */
export const modelSuffixRule: Rule = {
  id: ID,
  run({ sim, cand }) {
    if (!sim.missingModels.length) return pass(ID, "model tokens present");
    const forms = tokenize(cand.text).map((t) => t.replace(/[^a-z0-9]/g, ""));
    for (const m of sim.missingModels) {
      const digits = m.form.match(/\d{3,}/)?.[0];
      if (!digits) continue;
      const sibling = forms.find((f) => f !== m.form && f.match(/\d{3,}/)?.[0] === digits);
      if (sibling) return veto(ID, `${sibling} is not ${m.form}`, { want: m.form, got: sibling });
    }
    return pass(ID, "no sibling model");
  },
};
