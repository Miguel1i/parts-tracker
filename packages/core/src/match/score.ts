/** Runs the rules over an offer and turns the breakdown into accept / review / reject. */
import { RULES, buildContext } from "../rules";
import { result } from "../rules/context";
import { canonicalUrl, isJunkLink, looksLikeSearchUrl } from "./url";
import type {
  Decision,
  MatchDecision,
  MatchMerchant,
  MatchTarget,
  Offer,
  RuleResult,
} from "./types";

export const THRESHOLDS = {
  /** Score at or above which a product-page offer is accepted. */
  accept: 65,
  /** Score at or above which an offer goes to the review queue. */
  review: 45,
  /** Without an identifier match, an accept also needs this title similarity. */
  acceptSimilarityWithoutId: 0.9,
  /** A10: links below this similarity are dropped before fetching. */
  linkSimilarity: 0.6,
  /** A10: links kept per search page. */
  maxLinks: 5,
} as const;

export interface MatchOptions {
  /** The URL is pinned by a user (A16): never rejected, but rules still run. */
  pinned?: boolean;
}

function runRules(target: MatchTarget, offer: Offer, merchant: MatchMerchant) {
  const ctx = buildContext(target, offer, merchant);
  const results: RuleResult[] = [];
  for (const rule of RULES) {
    if (rule.stages && !rule.stages.includes(offer.stage)) continue;
    const r = rule.run(ctx);
    if (r) results.push(...(Array.isArray(r) ? r : [r]));
  }
  return { ctx, results };
}

/** Scores one offer (from a listing or a product page) against the product. */
export function matchOffer(
  target: MatchTarget,
  offer: Offer,
  merchant: MatchMerchant = {},
  options: MatchOptions = {},
): MatchDecision {
  const { ctx, results } = runRules(target, offer, merchant);
  const noPrice = !offer.price;
  if (noPrice) results.push(result("A12-no-price", "veto", 0, "no price found on the page"));

  const vetoes = results.filter((r) => r.verdict === "veto").map((r) => r.rule);
  const raw = results.reduce((s, r) => s + r.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
  const ids = results.find((r) => r.rule === "A6-identifiers");
  const identifierMatch = ids?.params?.matched === true;
  const suspect =
    typeof ids?.params?.suspect === "string" && ids.params.suspect
      ? ids.params.suspect.split(",")
      : [];

  let decision: Decision;
  if (vetoes.length) decision = "reject";
  else if (
    score >= THRESHOLDS.accept &&
    offer.stage === "page" &&
    (identifierMatch || ctx.sim.sim >= THRESHOLDS.acceptSimilarityWithoutId)
  )
    decision = "accept";
  else if (score >= THRESHOLDS.review) decision = "review";
  else decision = "reject";

  const out: MatchDecision = {
    decision,
    score,
    results,
    vetoes,
    similarity: ctx.sim.sim,
    identifierMatch,
    noPrice,
    suspectIdentifiers: decision === "accept" ? suspect : [],
  };
  if (options.pinned) {
    out.ruleDecision = decision;
    out.warning = decision !== "accept";
    out.decision = noPrice ? "reject" : "accept";
  }
  return out;
}

/** A link from a search page: anchor text (+ title/alt) and the text of its product card. */
export interface SearchLink {
  url: string;
  text: string;
  context?: string;
}

export interface LinkVerdict {
  url: string;
  text: string;
  similarity: number;
  /** Set when the link was dropped. */
  rule?: string;
  evidence?: string;
}

/**
 * A9–A11 pre-filter for search-page links, before anything is fetched: drops junk, search and
 * listing URLs, links whose text + slug already fail a cheap rule, and links whose similarity is
 * too low. Returns the best `max` links and every dropped one with its reason.
 */
export function prefilterLinks(
  target: MatchTarget,
  links: SearchLink[],
  merchant: MatchMerchant = {},
  max: number = THRESHOLDS.maxLinks,
): { kept: LinkVerdict[]; dropped: LinkVerdict[] } {
  const best = new Map<string, LinkVerdict>();
  const dropped: LinkVerdict[] = [];
  const LINK_RULES = new Set([
    "A1-refurbished",
    "A2-variant",
    "A3-efficiency-tier",
    "A5-prebuilt",
    "A8-not-product",
    "A14-blocklist",
    "B1-connectivity",
    "B2-gpu-line",
    "B4-packaging",
    "B5-colour",
    "B6-capacity",
    "B7-memory-kit",
    "B8-accessory",
    "B9-category",
    "B10-multipack",
    "B11-regional",
  ]);
  for (const link of links) {
    const base = { url: link.url, text: link.text, similarity: 0 };
    if (isJunkLink(link.url)) {
      dropped.push({
        ...base,
        rule: "A11-junk-link",
        evidence: "cart, wishlist, script or contact link",
      });
      continue;
    }
    if (looksLikeSearchUrl(link.url)) {
      dropped.push({ ...base, rule: "A8-not-product", evidence: "search or listing URL" });
      continue;
    }
    const offer: Offer = {
      url: link.url,
      canonicalUrl: canonicalUrl(link.url),
      stage: "link",
      title: link.text,
      gtins: [],
      stock: "unknown",
      categoryHints: [],
      pageKind: "unknown",
    };
    const { ctx, results } = runRules(target, offer, merchant);
    const v = results.find((r) => r.verdict === "veto" && LINK_RULES.has(r.rule));
    let sim = ctx.sim;
    if (link.context) {
      const withCard = buildContext(
        target,
        { ...offer, title: `${link.text} ${link.context}` },
        merchant,
      ).sim;
      if (withCard.sim > sim.sim) sim = withCard;
    }
    const verdict = { ...base, similarity: Math.round(sim.sim * 1000) / 1000 };
    if (v) {
      dropped.push({ ...verdict, rule: `A9:${v.rule}`, evidence: v.evidence });
      continue;
    }
    if (sim.missingModels.length || sim.sim < THRESHOLDS.linkSimilarity) {
      const why = sim.missingModels.length
        ? `model token missing: ${sim.missingModels.map((t) => t.token).join(", ")}`
        : `similarity ${verdict.similarity} < ${THRESHOLDS.linkSimilarity}`;
      dropped.push({ ...verdict, rule: "A10-link-score", evidence: why });
      continue;
    }
    const key = canonicalUrl(link.url);
    const prev = best.get(key);
    if (!prev || prev.similarity < verdict.similarity) best.set(key, verdict);
  }
  const sorted = [...best.values()].sort((a, b) => b.similarity - a.similarity);
  for (const extra of sorted.slice(max))
    dropped.push({ ...extra, rule: "A10-link-score", evidence: `not in the top ${max}` });
  return { kept: sorted.slice(0, max), dropped };
}
