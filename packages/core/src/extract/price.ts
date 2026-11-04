/** Price values with currency, EUR conversion and B13 sanity checks. */
import { fromPricePatterns, instalmentPatterns, wordsRegex } from "../lexicon/words";
import type { OfferPrice } from "../match/types";
import { fold } from "../match/text";
import { parsePrice } from "../price";

const INSTALMENT = new RegExp(instalmentPatterns.join("|"), "i");
const FROM = wordsRegex(fromPricePatterns);

const code = (c: string) => new RegExp(`(?<![a-z])${c}(?![a-z])`, "i");
const SYMBOLS: [RegExp, string][] = [
  [/€/, "EUR"],
  [code("eur"), "EUR"],
  [/£/, "GBP"],
  [code("gbp"), "GBP"],
  [code("usd"), "USD"],
  [/\$/, "USD"],
  [code("chf"), "CHF"],
  [/zł/i, "PLN"],
  [code("pln"), "PLN"],
  [code("sek"), "SEK"],
  [code("dkk"), "DKK"],
];

/** Currency named in a price string ("416,72€", "EUR440.76", "£399"), or null. */
export function detectCurrency(text: string): string | null {
  for (const [re, code] of SYMBOLS) if (re.test(text)) return code;
  return null;
}

/** FX rates as stored in `fx_rates`: units of the currency per 1 EUR. */
export type FxRates = Record<string, number>;

export function toEur(value: number, currency: string, rates: FxRates = {}): number | null {
  if (currency === "EUR") return value;
  const rate = rates[currency];
  return rate && rate > 0 ? Math.round((value / rate) * 100) / 100 : null;
}

export interface PriceInput {
  raw: string | number | undefined;
  /** Currency stated by structured data, if any. */
  currency?: string;
  /** Text around the price (its element and parent), checked for instalments / "from". */
  context?: string;
  source: string;
  /** Structured sources may fall back to the shop's currency; free text may not (B13). */
  structured: boolean;
}

/**
 * Reads one price candidate. Returns `{ price }` or `{ reason }` when the value must be
 * discarded (B13: instalment, "from" price, no currency, no FX rate).
 */
export function readPrice(
  input: PriceInput,
  shopCurrency: string,
  rates?: FxRates,
): { price: OfferPrice } | { reason: string } {
  const raw = input.raw == null ? "" : String(input.raw);
  const context = fold(input.context ?? raw);
  if (!input.structured && INSTALMENT.test(context))
    return { reason: `instalment price "${raw.trim()}"` };
  if (!input.structured && FROM.test(context)) return { reason: `"from" price "${raw.trim()}"` };
  const value = parsePrice(input.raw);
  if (value == null || value <= 0) return { reason: `unreadable price "${raw.trim()}"` };
  const currency =
    input.currency?.toUpperCase() ??
    detectCurrency(raw) ??
    (input.structured ? shopCurrency : null);
  if (!currency) return { reason: `price "${raw.trim()}" has no currency` };
  const eur = toEur(value, currency, rates);
  if (eur == null) return { reason: `no FX rate for ${currency}` };
  return { price: { value, currency, eur, source: input.source, raw: raw.trim() } };
}
