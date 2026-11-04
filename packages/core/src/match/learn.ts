/**
 * Feedback after a match (docs/matching.md §6): learned identifiers, auto-URL revalidation,
 * and duplicate listings. Pure: returns what the caller should write.
 */
import type { IdentifierKind, MatchDecision, Offer, TargetIdentifier } from "./types";

export interface IdentifierSighting {
  merchantId: string;
  url: string;
  at: number;
}

export interface StoredIdentifier extends TargetIdentifier {
  sightings: IdentifierSighting[];
}

export type IdentifierUpdate =
  | {
      op: "insert";
      kind: IdentifierKind;
      value: string;
      sourceMerchantId: string;
      confidence: number;
      sightings: IdentifierSighting[];
    }
  | {
      op: "update";
      kind: IdentifierKind;
      value: string;
      sightings?: IdentifierSighting[];
      confirmed?: boolean;
      confidence?: number;
    }
  | { op: "delete"; kind: IdentifierKind; value: string };

export const LEARNING = {
  /** Accepts need at least this title similarity before their codes are learned. */
  minSimilarity: 0.9,
  /** Distinct merchants that must agree before a learned code is confirmed. */
  merchantsToConfirm: 2,
  initialConfidence: 0.5,
  /** Confidence lost each time an accepted offer contradicts a learned code. */
  contradictionPenalty: 0.5,
  maxSightings: 10,
} as const;

/**
 * Identifier changes after a match: codes on an accepted page (not pinned, similarity ≥ 0.9)
 * are learned or get a sighting, and promoted once ≥ 2 merchants agree; learned codes the
 * accepted offer contradicted lose confidence and are deleted at 0. User codes never change.
 */
export function planIdentifierUpdates(input: {
  existing: StoredIdentifier[];
  offer: Offer;
  decision: MatchDecision;
  merchantId: string;
  now: number;
  pinned?: boolean;
}): IdentifierUpdate[] {
  const { existing, offer, decision, merchantId, now } = input;
  const updates: IdentifierUpdate[] = [];
  if (decision.decision !== "accept" || input.pinned || offer.stage !== "page") return updates;

  for (const value of decision.suspectIdentifiers) {
    const row = existing.find((e) => e.kind === "gtin" && e.value === value);
    if (!row || row.source !== "learned" || row.confirmed) continue;
    const confidence =
      (row.confidence ?? LEARNING.initialConfidence) - LEARNING.contradictionPenalty;
    updates.push(
      confidence <= 0
        ? { op: "delete", kind: "gtin", value }
        : { op: "update", kind: "gtin", value, confidence },
    );
  }

  if (decision.similarity < LEARNING.minSimilarity) return updates;
  const found: [IdentifierKind, string][] = [
    ...offer.gtins.map((g) => ["gtin", g] as [IdentifierKind, string]),
    ...(offer.mpn ? [["mpn", offer.mpn] as [IdentifierKind, string]] : []),
    ...(offer.asin ? [["asin", offer.asin.toUpperCase()] as [IdentifierKind, string]] : []),
  ];
  const sighting: IdentifierSighting = { merchantId, url: offer.canonicalUrl, at: now };
  for (const [kind, value] of found) {
    if (decision.suspectIdentifiers.includes(value)) continue;
    const row = existing.find(
      (e) => e.kind === kind && e.value.toUpperCase() === value.toUpperCase(),
    );
    if (!row) {
      updates.push({
        op: "insert",
        kind,
        value,
        sourceMerchantId: merchantId,
        confidence: LEARNING.initialConfidence,
        sightings: [sighting],
      });
      continue;
    }
    if (row.source === "user") continue;
    const sightings = [...row.sightings.filter((s) => s.merchantId !== merchantId), sighting].slice(
      -LEARNING.maxSightings,
    );
    const merchants = new Set(sightings.map((s) => s.merchantId)).size;
    const promote = !row.confirmed && merchants >= LEARNING.merchantsToConfirm;
    updates.push({
      op: "update",
      kind,
      value: row.value,
      sightings,
      ...(promote ? { confirmed: true, confidence: 1 } : {}),
    });
  }
  return updates;
}

/** A15: an auto-found URL that fails revalidation 3 runs in a row is dropped. */
export function nextAutoUrlState(
  failures: number,
  decision: MatchDecision["decision"],
): { failures: number; drop: boolean } {
  if (decision === "accept") return { failures: 0, drop: false };
  const next = failures + 1;
  return { failures: next, drop: next >= 3 };
}

/** B15: one offer per pair per run: the cheapest in stock, else the cheapest. */
export function selectBestOffer<T extends { offer: Offer; decision: MatchDecision }>(
  matches: T[],
): T | null {
  const accepted = matches.filter((m) => m.decision.decision === "accept" && m.offer.price);
  if (!accepted.length) return null;
  const rank = (m: T) => [
    m.offer.stock === "in_stock" ? 0 : m.offer.stock === "unknown" ? 1 : 2,
    m.offer.price!.eur,
  ];
  return accepted.sort((a, b) => {
    const [sa, pa] = rank(a);
    const [sb, pb] = rank(b);
    return sa! - sb! || pa! - pb!;
  })[0]!;
}
