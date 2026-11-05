/**
 * Affiliate product feeds (Awin): one download per merchant per run, matched offline instead of
 * fetching the shop's pages. A merchant uses a feed when its slug has a URL in the AWIN_FEEDS
 * env var (a GitHub secret: the "Create-a-Feed" download links contain the API key), e.g.
 *   AWIN_FEEDS={"worten":"https://productdata.awin.com/datafeed/download/apikey/…",
 *               "pccomponentes-pt":"https://productdata.awin.com/…"}
 */
import { gunzipSync } from "node:zlib";
import { FeedIndex, feedOffers, type FxRates } from "@parts/core";

/** The feed URL for a merchant slug, from AWIN_FEEDS; null when none (or the JSON is bad). */
export function feedUrlFor(slug: string, env: Record<string, string | undefined> = process.env) {
  const raw = env.AWIN_FEEDS?.trim();
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, unknown>;
    const url = map[slug];
    return typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** Gzip by magic bytes (Awin serves .gz as a download, not Content-Encoding); else UTF-8 text. */
export function decodeFeed(bytes: Uint8Array): string {
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  return new TextDecoder("utf-8").decode(gz ? gunzipSync(bytes) : bytes);
}

export async function loadFeed(
  url: string,
  rates: FxRates,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedIndex> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const text = decodeFeed(new Uint8Array(await res.arrayBuffer()));
  return new FeedIndex(feedOffers(text, rates));
}

/** Redacts a feed URL (it embeds the API key) for logs. */
export function redactFeedUrl(url: string) {
  return url.replace(/(apikey\/)[^/]+/i, "$1…").replace(/([?&](?:api_?key|key)=)[^&]+/i, "$1…");
}
