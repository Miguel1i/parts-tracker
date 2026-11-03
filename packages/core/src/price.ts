/**
 * Parse a price string in European or English notation into a number.
 * "1.234,56 €" → 1234.56, "1,234.56" → 1234.56, "399,90" → 399.9.
 * Returns null when no number can be read.
 */
export function parsePrice(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = input.replace(/[^\d.,]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // whichever separator comes last is the decimal one
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // "1,234" (thousands) vs "399,90" (decimal): 3 digits after a single comma = thousands
    const decimals = s.length - lastComma - 1;
    const commas = s.split(",").length - 1;
    s = commas === 1 && decimals !== 3 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const decimals = s.length - lastDot - 1;
    const dots = s.split(".").length - 1;
    if (dots > 1 || decimals === 3) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
