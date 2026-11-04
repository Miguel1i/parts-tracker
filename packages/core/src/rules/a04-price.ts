import { pass, result, veto, type Rule } from "./context";

const ID = "A4-price";

/** Points for a price ratio r = candidate / reference (see docs/matching.md §3). */
export function priceCurve(r: number): number | "veto" {
  if (r < 0.35 || r > 3) return "veto";
  if (r >= 0.8 && r <= 1.3) return 10;
  if (r < 0.8) return r >= 0.5 ? (-20 * (0.8 - r)) / 0.3 : -20 - (15 * (0.5 - r)) / 0.15;
  return r <= 2 ? (-20 * (r - 1.3)) / 0.7 : -20 - 15 * (r - 2);
}

/** A4: price plausibility against `refPrice`, or the median of recent accepted prices. */
export const priceRule: Rule = {
  id: ID,
  stages: ["listing", "page"],
  run({ offer, refPrice, spec, cand }) {
    if (!offer.price) return pass(ID, "no price");
    if (!refPrice) return pass(ID, "no reference price");
    let eur = offer.price.eur;
    const pack = cand.attrs.packSize;
    if (spec.allowPacks && pack) eur = (eur / pack) * (spec.quantity ?? 1);
    const r = eur / refPrice;
    const params = {
      price: Math.round(eur * 100) / 100,
      ref: refPrice,
      ratio: Math.round(r * 100) / 100,
    };
    const pts = priceCurve(r);
    const desc = `${params.price} € is ${params.ratio}× the reference ${refPrice} €`;
    if (pts === "veto") return veto(ID, `${desc} (outside 0.35×–3×)`, params);
    const w = Math.round(pts * 10) / 10;
    return result(ID, w > 0 ? "boost" : w < 0 ? "penalty" : "pass", w, desc, params);
  },
};
