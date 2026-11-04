/** MPN / SKU comparison helpers (GTINs live in ../gtin.ts). */

export function normalizeMpn(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * True when a candidate MPN/SKU is the reference MPN. A short regional suffix on the candidate
 * is allowed ("MZ-V9S2T0BW" vs "MZ-V9S2T0BW/EU"); a shorter candidate is not
 * ("100-100001084WOF" boxed vs "100-100001084" isn't proof).
 */
export function mpnMatches(reference: string, candidate: string | null | undefined): boolean {
  const r = normalizeMpn(reference);
  const c = normalizeMpn(candidate);
  if (r.length < 6 || !c) return false;
  if (r === c) return true;
  return r.length >= 8 && c.startsWith(r) && c.length - r.length <= 3;
}
