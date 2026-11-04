/** What every rule sees: the target and offer, pre-parsed once per match. */
import { parseAttributes, type Attributes } from "../match/attributes";
import { median } from "../match/text";
import {
  brandKey,
  detectBrands,
  isKnownBrand,
  matchText,
  referenceTokens,
  titleSimilarity,
  type RefToken,
  type Similarity,
} from "../match/tokens";
import type {
  MatchMerchant,
  MatchSpec,
  MatchTarget,
  Offer,
  RuleResult,
  Stage,
  Verdict,
} from "../match/types";
import { slugText } from "../match/url";

export interface RuleContext {
  target: MatchTarget;
  merchant: MatchMerchant;
  offer: Offer;
  stage: Stage;
  spec: MatchSpec;
  ref: { text: string; attrs: Attributes; tokens: RefToken[]; brand: string | null };
  cand: { text: string; attrs: Attributes; brands: string[] };
  sim: Similarity;
  /** Reference EUR price: `refPrice`, else the median of ≥ 3 recent prices. */
  refPrice: number | null;
}

export interface Rule {
  id: string;
  /** Stages the rule runs at (default: all). */
  stages?: Stage[];
  run(ctx: RuleContext): RuleResult | RuleResult[] | null;
}

export function result(
  rule: string,
  verdict: Verdict,
  weight: number,
  evidence: string,
  params?: RuleResult["params"],
): RuleResult {
  return {
    rule,
    verdict,
    weight: verdict === "veto" || verdict === "pass" ? 0 : weight,
    evidence,
    ...(params ? { params } : {}),
  };
}

export const pass = (rule: string, evidence = "ok", params?: RuleResult["params"]) =>
  result(rule, "pass", 0, evidence, params);
export const veto = (rule: string, evidence: string, params?: RuleResult["params"]) =>
  result(rule, "veto", 0, evidence, params);

/** The candidate text a rule reads: the title, plus the URL slug for search links. */
export function candidateText(offer: Offer, stage: Stage): string {
  const parts = [offer.title ?? ""];
  if (stage === "link") parts.push(slugText(offer.url));
  return parts.join(" ");
}

export function buildContext(
  target: MatchTarget,
  offer: Offer,
  merchant: MatchMerchant = {},
): RuleContext {
  const stage = offer.stage;
  const refRaw = [target.name, target.query].filter(Boolean).join(" ");
  const refText = matchText(refRaw);
  const tokens = referenceTokens(target);
  const candRaw = candidateText(offer, stage);
  const candText = matchText(candRaw);
  const recent = target.recentPrices ?? [];
  const refPrice =
    target.refPrice && target.refPrice > 0
      ? target.refPrice
      : recent.length >= 3
        ? median(recent)
        : null;
  const refBrand = brandKey(target.brand) ?? detectBrands(refRaw)[0] ?? null;
  const brands = new Set(detectBrands(candRaw));
  // An unlisted brand string (often the shop's own name) only counts when it is the product's brand.
  const offerBrand = brandKey(offer.brand);
  if (offerBrand && (isKnownBrand(offerBrand) || offerBrand === refBrand)) brands.add(offerBrand);
  return {
    target,
    merchant,
    offer,
    stage,
    spec: target.spec ?? {},
    ref: {
      text: refText,
      attrs: parseAttributes(refText, target.category),
      tokens,
      brand: refBrand,
    },
    cand: {
      text: candText,
      attrs: parseAttributes(candText, target.category),
      brands: [...brands],
    },
    sim: titleSimilarity(tokens, candRaw),
    refPrice,
  };
}
