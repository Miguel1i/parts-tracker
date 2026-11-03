/**
 * GTIN helpers. UPC-A (12), EAN-13 (13) and GTIN-14 are the same number space:
 * a UPC is an EAN-13 with a leading 0, and every GTIN zero-pads to 14 digits.
 * GTIN-8 (EAN-8) is accepted too. Identifiers are stored as 14-digit strings.
 */

const VALID_LENGTHS = new Set([8, 12, 13, 14]);

/** Computes the GS1 mod-10 check digit for the digits that precede it. */
export function gtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error(`gtinCheckDigit: not digits: ${body}`);
  let sum = 0;
  // Weights alternate 3,1,3,... starting from the rightmost body digit.
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Strips spaces, dashes and dots that shops put inside barcodes. */
function digitsOnly(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s.-]/g, "");
  return /^\d+$/.test(cleaned) ? cleaned : null;
}

/** True when `raw` is an 8/12/13/14-digit GTIN with a correct check digit. */
export function isValidGtin(raw: string): boolean {
  return normalizeGtin(raw) !== null;
}

/**
 * Normalizes a GTIN-8/UPC-12/EAN-13/GTIN-14 to 14 digits.
 * Returns null when the input isn't a GTIN or its check digit is wrong.
 */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = digitsOnly(raw);
  if (!digits || !VALID_LENGTHS.has(digits.length)) return null;
  const padded = digits.padStart(14, "0");
  if (/^0+$/.test(padded)) return null;
  const check = gtinCheckDigit(padded.slice(0, 13));
  return check === Number(padded[13]) ? padded : null;
}

/** Shortest conventional form: EAN-13 when the GTIN-14 has a leading 0, else GTIN-14. */
export function gtinToEan13(gtin14: string): string | null {
  const g = normalizeGtin(gtin14);
  if (!g) return null;
  return g.startsWith("0") ? g.slice(1) : null;
}

/** UPC-A (12 digits) when the GTIN starts with two zeros, else null. */
export function gtinToUpc(gtin14: string): string | null {
  const g = normalizeGtin(gtin14);
  if (!g) return null;
  return g.startsWith("00") ? g.slice(2) : null;
}
