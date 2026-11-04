import { pass, veto, type Rule } from "./context";

const ID = "B1-connectivity";

/** B1: WiFi vs non-WiFi boards. Suffixes like "-E"/"-F" are part of the model token (B3). */
export const connectivityRule: Rule = {
  id: ID,
  run({ ref, cand, target, stage }) {
    if (target.category !== "motherboard" && target.category !== "other")
      return pass(ID, "not checked for this category");
    const want = ref.attrs.wifi;
    const got = cand.attrs.wifi;
    if (got && !want) return veto(ID, "offer has WiFi, the product doesn't");
    // Link text is often truncated, so a missing "WiFi" only fails a full title.
    if (want && !got && stage !== "link")
      return veto(ID, "the product has WiFi, the offer doesn't");
    return pass(ID, want ? "WiFi" : "no WiFi");
  },
};
