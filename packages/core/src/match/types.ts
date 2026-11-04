/** Shared types of the matching engine. See docs/matching.md. */

export const categories = [
  "cpu",
  "gpu",
  "motherboard",
  "ram",
  "ssd",
  "hdd",
  "psu",
  "case",
  "cooler",
  "fan",
  "monitor",
  "other",
] as const;
export type Category = (typeof categories)[number];

export type IdentifierKind = "gtin" | "mpn" | "asin";

/** Per-product matching options, stored in `products.match_spec`. */
export type MatchSpec = {
  /** Retail box vs tray/OEM; `any` (default) accepts both. */
  packaging?: "box" | "tray" | "any";
  /** `any` allows refurbished/used offers (default `new`). */
  condition?: "new" | "any";
  /** Units per offer the product means (default 1). */
  quantity?: number;
  /** Accept multipacks and compare the unit price. */
  allowPacks?: boolean;
};

export interface TargetIdentifier {
  kind: IdentifierKind;
  /** GTINs as 14 digits; MPNs as typed. */
  value: string;
  source: "user" | "learned";
  confirmed: boolean;
  confidence?: number;
}

export interface BlockEntry {
  url?: string | null;
  name?: string | null;
  externalId?: string | null;
}

/** The reference product, built by the caller from the DB. */
export interface MatchTarget {
  name: string;
  /** The search query (usually the cleanest form of the name). */
  query?: string;
  brand?: string | null;
  category: Category;
  /** Reference price in EUR. */
  refPrice?: number | null;
  /** Accepted EUR prices of the last 30 days, all merchants. */
  recentPrices?: number[];
  identifiers: TargetIdentifier[];
  spec?: MatchSpec;
  /** Blocklist rows for this product at this merchant (and merchant-less rows). */
  blocklist?: BlockEntry[];
}

/** The merchant side of a match. */
export interface MatchMerchant {
  /** Only accept offers sold by the shop itself. */
  ownOnly?: boolean;
  /** ISO country code of the shop (`GB` allows UK plugs). */
  country?: string | null;
}

export type Stock = "in_stock" | "out_of_stock" | "preorder" | "unknown";
export type Stage = "link" | "listing" | "page";

export interface OfferPrice {
  value: number;
  currency: string;
  /** Value in EUR (equal to `value` when the currency is EUR). */
  eur: number;
  /** Where the price came from: `jsonld`, `selector`, `meta`, … */
  source: string;
  raw: string;
}

export interface OfferSeller {
  name?: string;
  /** true = the shop itself, false = a marketplace seller. */
  own: boolean | "unknown";
  evidence: string;
}

/** A candidate offer, from a search link, a listing card or a product page. */
export interface Offer {
  url: string;
  canonicalUrl: string;
  stage: Stage;
  title?: string;
  titleSource?: string;
  brand?: string;
  /** Normalized 14-digit GTINs found in structured data. */
  gtins: string[];
  mpn?: string;
  sku?: string;
  asin?: string;
  price?: OfferPrice;
  condition?: "new" | "refurbished" | "used" | "damaged";
  stock: Stock;
  seller?: OfferSeller;
  /** Breadcrumbs and JSON-LD categories. */
  categoryHints: string[];
  pageKind: "product" | "listing" | "unknown";
  /** Visible page text (truncated), used to find reference codes printed on the page. */
  text?: string;
  image?: string;
  /** Extraction notes (discarded prices, rejected titles) for the trace. */
  notes?: string[];
}

export type Verdict = "veto" | "penalty" | "boost" | "pass";

export interface RuleResult {
  rule: string;
  verdict: Verdict;
  /** Points added to the score (negative for penalties, 0 for pass/veto). */
  weight: number;
  evidence: string;
  params?: Record<string, string | number | boolean>;
}

export type Decision = "accept" | "review" | "reject";

export interface MatchDecision {
  decision: Decision;
  /** 0–100. */
  score: number;
  results: RuleResult[];
  vetoes: string[];
  /** Title similarity, 0–1. */
  similarity: number;
  /** Some identifier on the offer matched the target. */
  identifierMatch: boolean;
  /** No usable price: report `not_found` "no price" rather than a wrong product (A12). */
  noPrice: boolean;
  /** Pinned URLs: the decision the rules would have made (A16 warning badge). */
  ruleDecision?: Decision;
  warning?: boolean;
  /** Learned GTINs the offer contradicted while being accepted on other evidence. */
  suspectIdentifiers: string[];
}
