/** Search URLs and the GTIN → MPN → text query order. */
import { asinFromUrl, gtinToEan13, type MatchTarget, type TargetIdentifier } from "@parts/core";

/**
 * Fills `{q}` in a merchant search template. In a query string spaces become `+`
 * (`?q=amd+ryzen`); in a path they are percent-encoded (`/pesquisa/amd%20ryzen`).
 */
export function buildSearchUrl(template: string, q: string): string {
  const at = template.indexOf("{q}");
  if (at < 0) throw new Error(`search template has no {q}: ${template}`);
  const queryStart = template.indexOf("?");
  const inQuery = queryStart >= 0 && queryStart < at;
  const encoded = inQuery
    ? encodeURIComponent(q).replace(/%20/g, "+")
    : encodeURIComponent(q).replace(/%2F/gi, "%20");
  return template.replace("{q}", encoded);
}

export interface SearchQuery {
  kind: "gtin" | "mpn" | "text";
  q: string;
}

/** User and confirmed codes first, then learned ones by confidence. */
function rank(a: TargetIdentifier, b: TargetIdentifier) {
  const trust = (i: TargetIdentifier) => (i.source === "user" ? 2 : i.confirmed ? 1 : 0);
  return trust(b) - trust(a) || (b.confidence ?? 1) - (a.confidence ?? 1);
}

/**
 * At most one GTIN query (as EAN-13 when it fits), one MPN query and the text query, in that
 * order (docs/matching.md §2). Identifier queries only find candidates; the page still has to
 * match on its own evidence.
 */
export function searchQueries(target: MatchTarget): SearchQuery[] {
  const out: SearchQuery[] = [];
  const pick = (kind: "gtin" | "mpn") =>
    target.identifiers.filter((i) => i.kind === kind && (i.confidence ?? 1) > 0).sort(rank)[0];
  const gtin = pick("gtin");
  if (gtin) out.push({ kind: "gtin", q: gtinToEan13(gtin.value) ?? gtin.value });
  const mpn = pick("mpn");
  if (mpn && mpn.value.length >= 6) out.push({ kind: "mpn", q: mpn.value });
  const text = (target.query || target.name).trim();
  if (text) out.push({ kind: "text", q: text });
  return out;
}

export const isAmazonHost = (url: string) => {
  try {
    return /(^|\.)amazon\.[a-z.]+$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

/**
 * ASIN reuse across amazon.* shops: a product found on one Amazon is usually the same ASIN on
 * the others, so `/dp/<ASIN>` is tried before searching.
 */
export function productAsin(target: MatchTarget, urls: (string | null | undefined)[]) {
  const id = target.identifiers.filter((i) => i.kind === "asin").sort(rank)[0];
  if (id) return id.value.toUpperCase();
  for (const u of urls) {
    const a = u && isAmazonHost(u) ? asinFromUrl(u) : null;
    if (a) return a.toUpperCase();
  }
  return null;
}

export function amazonProductUrl(baseUrl: string, asin: string): string {
  return new URL(`/dp/${asin}`, baseUrl).toString();
}
