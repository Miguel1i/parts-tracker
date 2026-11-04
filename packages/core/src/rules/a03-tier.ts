import { pass, veto, type Rule } from "./context";

const ID = "A3-efficiency-tier";
const EFFICIENCY_CONTEXT = /\b(?:80\s*(?:\+|plus)|cybenetics)\b/;

/** A3: 80 Plus / Cybenetics tiers differ (Gold vs Platinum), when both sides name one. */
export const tierRule: Rule = {
  id: ID,
  run({ ref, cand, target }) {
    if (target.category !== "psu" && !EFFICIENCY_CONTEXT.test(ref.text))
      return pass(ID, "not a PSU");
    const want = ref.attrs.tiers;
    const got = cand.attrs.tiers;
    if (!want.length || !got.length) return pass(ID, "no tier on one side");
    if (!got.some((t) => want.includes(t)))
      return veto(ID, `tier ${got.join("/")} ≠ ${want.join("/")}`, {
        want: want.join(","),
        got: got.join(","),
      });
    return pass(ID, `tier ${want.join("/")}`);
  },
};
