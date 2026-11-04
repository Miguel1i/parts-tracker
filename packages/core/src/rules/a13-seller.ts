import { pass, result, veto, type Rule } from "./context";

const ID = "A13-seller";

/** A13: for `ownOnly` shops, the offer must be sold by the shop itself. */
export const sellerRule: Rule = {
  id: ID,
  stages: ["listing", "page"],
  run({ merchant, offer }) {
    if (!merchant.ownOnly) return pass(ID, "marketplace sellers allowed");
    const s = offer.seller;
    if (s?.own === false)
      return veto(ID, `sold by ${s.name ?? "a marketplace seller"}`, {
        seller: s.name ?? "",
        evidence: s.evidence,
      });
    if (s?.own === true)
      return pass(ID, `sold by ${s.name ?? "the shop"}`, { seller: s.name ?? "" });
    return result(ID, "penalty", -10, "seller unknown", { seller: "" });
  },
};
