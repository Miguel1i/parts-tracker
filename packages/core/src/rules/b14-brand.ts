import { chipBrands } from "../lexicon/words";
import type { Category } from "../match/types";
import { pass, result, veto, type Rule } from "./context";

const ID = "B14-brand";
/** Where brand text is noisy (chip vs board maker), a mismatch only costs points. */
const SOFT: Category[] = ["cpu", "other"];

/** B14: the offer's brand (JSON-LD or title) differs from the product's. */
export const brandRule: Rule = {
  id: ID,
  run({ ref, cand, target, stage }) {
    const want = ref.brand;
    if (!want) return pass(ID, "product has no brand");
    if (!cand.brands.length) return pass(ID, "no brand on the offer");
    if (cand.brands.includes(want))
      return result(ID, stage === "link" ? "pass" : "boost", 5, `brand ${want}`);
    // A GPU or board title naming only the chip maker ("NVIDIA", "AMD") says nothing about the board brand.
    if (cand.brands.every((b) => chipBrands.includes(b)) && !chipBrands.includes(want))
      return pass(ID, `only the chip maker ${cand.brands.join("/")} named`);
    const got = cand.brands.join("/");
    if (SOFT.includes(target.category))
      return result(ID, "penalty", -15, `brand ${got} ≠ ${want}`, { want, got });
    return veto(ID, `brand ${got} ≠ ${want}`, { want, got });
  },
};
