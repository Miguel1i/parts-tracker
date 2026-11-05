import { canonicalUrl, normalizeGtin } from "@parts/core";

export type PageIdentifiers = {
  gtins?: string[];
  mpn?: string;
  asin?: string;
  sku?: string;
  brand?: string;
};

export type IdentifierToConfirm = { kind: "gtin" | "mpn" | "asin"; value: string };

/** Only http(s) URLs may become links or images (scraped data is untrusted). */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

/** Identifiers on a candidate page that Approve confirms: valid GTINs (14 digits), MPN, ASIN. */
export function identifiersToConfirm(
  page: PageIdentifiers | null | undefined,
): IdentifierToConfirm[] {
  if (!page) return [];
  const out: IdentifierToConfirm[] = [];
  const seen = new Set<string>();
  const add = (kind: IdentifierToConfirm["kind"], value: string) => {
    const key = `${kind}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, value });
  };
  for (const raw of page.gtins ?? []) {
    const gtin = normalizeGtin(raw);
    if (gtin) add("gtin", gtin);
  }
  const mpn = page.mpn?.trim();
  if (mpn) add("mpn", mpn);
  const asin = page.asin?.trim();
  if (asin) add("asin", asin);
  return out;
}

/** The shop-side ID stored on a blocklist row: ASIN first, then SKU. */
export function blocklistExternalId(page: PageIdentifiers | null | undefined): string | null {
  return page?.asin?.trim() || page?.sku?.trim() || null;
}

function sameUrl(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  return a === b || canonicalUrl(a) === canonicalUrl(b);
}

/**
 * Which pinned URLs of a (product, merchant) pair a rejected candidate invalidates: those equal
 * to the candidate URL after canonical normalisation. Returns null when nothing changes.
 */
export function urlsToClear(
  pair: { manualUrl: string | null; autoUrl: string | null },
  candidateUrl: string,
): { manualUrl?: null; autoUrl?: null } | null {
  const patch: { manualUrl?: null; autoUrl?: null } = {};
  if (sameUrl(pair.manualUrl, candidateUrl)) patch.manualUrl = null;
  if (sameUrl(pair.autoUrl, candidateUrl)) patch.autoUrl = null;
  return Object.keys(patch).length ? patch : null;
}

export function isReport(signals: { stage?: string } | null | undefined): boolean {
  return signals?.stage === "report";
}
