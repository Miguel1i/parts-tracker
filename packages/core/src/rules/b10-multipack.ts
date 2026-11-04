import { pass, veto, type Rule } from "./context";

const ID = "B10-multipack";

/** B10: a pack of several units when the product is one (or a different pack size). */
export const multipackRule: Rule = {
  id: ID,
  run({ spec, ref, cand }) {
    const want = spec.quantity ?? ref.attrs.packSize ?? 1;
    const got = cand.attrs.packSize ?? 1;
    if (got === want) return pass(ID, `${want} unit${want > 1 ? "s" : ""}`);
    if (spec.allowPacks) return pass(ID, `pack of ${got}: unit price compared`, { got });
    return veto(ID, `pack of ${got}, the product is ${want}`, { want, got });
  },
};
