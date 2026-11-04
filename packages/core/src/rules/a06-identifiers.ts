import { gtinToEan13, gtinToUpc } from "../gtin";
import { mpnMatches } from "../match/identifiers";
import { compact } from "../match/text";
import type { TargetIdentifier } from "../match/types";
import { result, veto, type Rule } from "./context";

const ID = "A6-identifiers";
const CAP = 45;
const strong = (i: TargetIdentifier) => i.source === "user" || i.confirmed;

/**
 * A6 and the identifier signals: GTIN, MPN/SKU and ASIN on the offer against the product's
 * identifiers. A mismatch with a confirmed GTIN vetoes; with an unconfirmed learned one it only
 * costs points, and nothing when another identifier matches (the learned code is then suspect).
 */
export const identifierRule: Rule = {
  id: ID,
  stages: ["listing", "page"],
  run({ target, offer, stage, sim }) {
    const ids = target.identifiers;
    const gtins = ids.filter((i) => i.kind === "gtin");
    let points = 0;
    let matched = false;
    const notes: string[] = [];

    const asin = offer.asin?.toUpperCase();
    if (asin && ids.some((i) => i.kind === "asin" && i.value.toUpperCase() === asin)) {
      points += 45;
      matched = true;
      notes.push(`ASIN ${asin} matches`);
    }

    for (const m of ids.filter((i) => i.kind === "mpn")) {
      const hit = [offer.mpn, offer.sku].find((c) => mpnMatches(m.value, c));
      if (hit) {
        points += strong(m) ? 40 : 20;
        matched = true;
        notes.push(`MPN ${hit} matches${strong(m) ? "" : " (learned)"}`);
      }
    }

    let suspect: string[] = [];
    if (offer.gtins.length && gtins.length) {
      const overlap = gtins.filter((g) => offer.gtins.includes(g.value));
      if (overlap.length) {
        const s = overlap.some(strong);
        points += s ? 45 : 25;
        matched = true;
        notes.push(`GTIN ${overlap[0]!.value} matches${s ? "" : " (learned)"}`);
      } else {
        const confirmed = gtins.filter(strong);
        if (confirmed.length)
          return veto(
            ID,
            `GTIN ${offer.gtins.join(", ")} ≠ confirmed ${confirmed.map((g) => g.value).join(", ")}`,
            {
              got: offer.gtins.join(","),
              want: confirmed.map((g) => g.value).join(","),
              matched: false,
            },
          );
        const learned = gtins.map((g) => g.value).join(", ");
        if (matched) {
          suspect = gtins.map((g) => g.value);
          notes.push(`GTIN ${offer.gtins.join(", ")} contradicts unconfirmed learned ${learned}`);
        } else {
          points -= 10;
          notes.push(`GTIN ${offer.gtins.join(", ")} ≠ unconfirmed learned ${learned}`);
        }
      }
    }

    // A reference code printed on the page (not in structured data). Search pages echo the query,
    // so only on product pages, and only when the title already looks right.
    if (!matched && stage === "page" && offer.text && sim.sim >= 0.4) {
      const text = compact(offer.text);
      const codes = [
        ...gtins.flatMap((g) => [gtinToEan13(g.value), gtinToUpc(g.value), g.value]),
        ...ids.filter((i) => i.kind === "mpn").map((i) => i.value),
      ]
        .filter((c): c is string => !!c)
        .map(compact)
        .filter((c) => c.length >= 6);
      const hit = codes.find((c) => text.includes(c));
      if (hit) {
        points += 10;
        matched = true;
        notes.push(`code ${hit} printed on the page`);
      }
    }

    points = Math.min(points, CAP);
    const params = { matched, suspect: suspect.join(",") };
    if (!notes.length) return result(ID, "pass", 0, "no comparable identifiers", params);
    const verdict = points > 0 ? "boost" : points < 0 ? "penalty" : "pass";
    return result(ID, verdict, points, notes.join("; "), params);
  },
};
