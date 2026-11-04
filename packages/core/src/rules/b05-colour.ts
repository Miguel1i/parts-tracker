import type { Category } from "../match/types";
import { pass, veto, type Rule } from "./context";

const ID = "B5-colour";

/** GPU titles use colour words in line names (Red Devil), so only black/white count there. */
const ONLY: Partial<Record<Category, string[]>> = { gpu: ["black", "white"], cpu: [] };
const NON_RGB = /(?<![a-z0-9])(?:non[ -]?rgb|sem rgb|sin rgb|sans rgb|no rgb)(?![a-z0-9])/;

/** B5: colour or lighting edition differs, when the product names one. */
export const colourRule: Rule = {
  id: ID,
  run({ ref, cand, target }) {
    const only = ONLY[target.category];
    const keep = (c: string[]) => (only ? c.filter((x) => only.includes(x)) : c);
    const want = keep(ref.attrs.colours);
    const got = keep(cand.attrs.colours);
    if (want.length && got.length && !got.some((c) => want.includes(c)))
      return veto(ID, `colour ${got.join("/")} ≠ ${want.join("/")}`, {
        want: want.join(","),
        got: got.join(","),
      });
    if (ref.attrs.lighting && NON_RGB.test(cand.text))
      return veto(ID, "offer is the non-RGB edition");
    return pass(ID, want.length ? `colour ${want.join("/")}` : "no colour named");
  },
};
