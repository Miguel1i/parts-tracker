/** A13 seller detection on a product page. */
import type { CheerioAPI } from "cheerio";
import { soldByPhrases } from "../lexicon/words";
import { compact, fold } from "../match/text";
import type { OfferSeller } from "../match/types";
import type { SellerConfig } from "./hosts";

const SOLD_BY = new RegExp(`(?<![a-z])(?:${soldByPhrases.join("|")})\\s*:?\\s*`, "g");

function cleanName(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Who sells the offer. Order: third-party markers, the configured seller element, JSON-LD
 * `offers.seller`, then a "sold by …" phrase in the visible text. Nothing found → unknown.
 */
export function detectSeller(
  $: CheerioAPI,
  html: string,
  config: SellerConfig,
  jsonLdSeller?: string,
): OfferSeller {
  const own = (config.ownNames ?? []).map(compact).filter(Boolean);
  const isOwn = (name: string) => {
    const c = compact(name);
    return own.some((o) => c.includes(o));
  };
  const selectorName = config.sellerSelector
    ? cleanName($(config.sellerSelector).first().text())
    : "";

  for (const marker of config.thirdPartyMarkers ?? []) {
    const at = html.indexOf(marker);
    if (at === -1) continue;
    let name = selectorName && !isOwn(selectorName) ? selectorName : "";
    // A class/id marker: the seller name is that element's text.
    if (!name && /^[\w-]+$/.test(marker))
      name = cleanName($(`[class~="${marker}"], [id="${marker}"]`).first().text());
    if (!name) {
      const near = html
        .slice(at, at + 600)
        .replace(/^[^>]*>/, "")
        .replace(/<[^>]*>/g, "  ");
      name = cleanName(
        near
          .replace(/[{}"\\]/g, " ")
          .split(/\s{2,}/)
          .find((x) => x.trim()) ?? "",
      );
    }
    return { name: name || undefined, own: false, evidence: `marketplace marker "${marker}"` };
  }

  if (selectorName)
    return {
      name: selectorName,
      own: isOwn(selectorName),
      evidence: `seller element "${selectorName}"`,
    };
  if (jsonLdSeller)
    return {
      name: jsonLdSeller,
      own: own.length ? isOwn(jsonLdSeller) : "unknown",
      evidence: "JSON-LD seller",
    };

  const text = fold($("body").text().replace(/\s+/g, " "));
  for (const m of text.matchAll(SOLD_BY)) {
    const name = cleanName(text.slice(m.index! + m[0].length, m.index! + m[0].length + 60)).split(
      /[.,;|(]| {2}/,
    )[0]!;
    if (!name || /^[^a-z0-9]/.test(name)) continue;
    return {
      name,
      own: own.length ? isOwn(name) : "unknown",
      evidence: `"${m[0].trim()} ${name}"`,
    };
  }
  return { own: "unknown", evidence: "no seller information" };
}
