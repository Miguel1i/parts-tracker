/**
 * One (product, merchant) pair: pinned URL, else the auto URL, else search. Pure with respect to
 * the DB: it only fetches through the given `PageFetcher` and returns what should be written.
 */
import {
  canonicalUrl,
  extractProductPage,
  extractSearchPage,
  looksLikeSearchUrl,
  matchOffer,
  nextAutoUrlState,
  prefilterLinks,
  saleorOffer,
  saleorProductBody,
  saleorProductNode,
  saleorSearchBody,
  saleorSearchNodes,
  saleorSlugFromUrl,
  selectBestOffer,
  type ExtractOptions,
  type FxRates,
  type MatchDecision,
  type MatchMerchant,
  type MatchTarget,
  type Offer,
  type SaleorConfig,
} from "@parts/core";
import type { AdapterConfig, LastMatch, ScrapeStatus } from "@parts/db";
import type { FetchResult, PageFetcher } from "./http";
import { clampLimits } from "./limiter";
import { amazonProductUrl, buildSearchUrl, isAmazonHost, searchQueries } from "./queries";

/** A valid `adapterConfig.saleor` (https endpoint + channel), or null. */
export function saleorConfig(adapter: AdapterConfig): SaleorConfig | null {
  const c = adapter.saleor as Partial<SaleorConfig> | undefined;
  if (!c || typeof c.endpoint !== "string" || typeof c.channel !== "string") return null;
  if (!/^https:\/\//i.test(c.endpoint) || !c.channel.trim()) return null;
  return { endpoint: c.endpoint, channel: c.channel.trim() };
}

export interface PairMerchant {
  id: string;
  name: string;
  baseUrl: string;
  searchTemplate: string;
  currency: string;
  country: string | null;
  ownOnly: boolean;
  needsBrowser: boolean;
  adapterConfig: AdapterConfig;
}

export interface PairState {
  manualUrl: string | null;
  autoUrl: string | null;
  autoUrlFailures: number;
}

export interface PairInput {
  productId: string;
  productName: string;
  merchant: PairMerchant;
  state: PairState | null;
  target: MatchTarget;
  /** ASIN to try at amazon.* shops before searching. */
  asin?: string | null;
  rates: FxRates;
}

export interface Scored {
  offer: Offer;
  decision: MatchDecision;
  via: "manual" | "auto" | "asin" | "search";
}

/** A fetched page kept for the Actions debug artifact (never the DB). */
export interface FailurePage {
  url: string;
  status: number;
  reason: string;
  html: string;
}

export interface PairOutcome {
  status: ScrapeStatus;
  message: string;
  trace: string[];
  accepted?: Scored;
  /** Best review candidate when nothing was accepted. */
  review?: Scored;
  lastMatch?: LastMatch;
  /** New auto-URL state; undefined leaves it unchanged. */
  autoUrl?: { url: string | null; failures: number };
  failurePages: FailurePage[];
  requests: number;
  ms: number;
}

/** Pairs share this per run so a merchant found to render search with JS skips plain fetch. */
export interface RunMemo {
  jsSearch: Set<string>;
}

const MAX_TRACE_DROPS = 12;

export async function scrapePair(
  input: PairInput,
  fetcher: PageFetcher,
  opts: { now: () => number; memo?: RunMemo },
): Promise<PairOutcome> {
  const { merchant, target, state } = input;
  const started = opts.now();
  const memo = opts.memo ?? { jsSearch: new Set() };
  const trace: string[] = [];
  const failurePages: FailurePage[] = [];
  const log = (line: string) => trace.push(line);
  const mm: MatchMerchant = { ownOnly: merchant.ownOnly, country: merchant.country };
  const limits = clampLimits(merchant.adapterConfig);
  const extractOpts: ExtractOptions = {
    currency: merchant.currency,
    rates: input.rates,
    selectors: merchant.adapterConfig.selectors,
    sellerRule: merchant.adapterConfig.sellerRule,
  };
  let requests = 0;
  let okFetches = 0;
  let blockedFetches = 0;
  let errorFetches = 0;
  let lastBlock = "";
  let lastError = "";

  const fetchPage = async (url: string, browser: boolean): Promise<FetchResult> => {
    const r = await fetcher.get(url, { browser: browser || merchant.needsBrowser, limits });
    requests += r.attempts;
    const tag = `${r.via} ${r.status || "ERR"} ${(r.ms / 1000).toFixed(1)}s`;
    if (r.blocked) {
      blockedFetches++;
      lastBlock = r.blocked;
      log(`  ✗ ${tag} blocked (${r.blocked}) ${url}`);
      if (failurePages.length < 4)
        failurePages.push({ url, status: r.status, reason: r.blocked, html: r.html });
    } else if (r.status === 0 || r.status >= 400) {
      errorFetches++;
      lastError = r.error ?? `HTTP ${r.status}`;
      log(`  ✗ ${tag} ${lastError} ${url}`);
      if (failurePages.length < 4 && r.html)
        failurePages.push({ url, status: r.status, reason: lastError, html: r.html });
    } else {
      okFetches++;
      log(`  · ${tag} ${url}${r.finalUrl !== url ? ` → ${r.finalUrl}` : ""}`);
    }
    return r;
  };
  const usable = (r: FetchResult) => !r.blocked && r.status > 0 && r.status < 400;

  /*
   * Shops with a public Saleor storefront API (adapterConfig.saleor): product lookups and
   * searches go to the API instead of the HTML pages, which may sit behind a bot wall. Same
   * per-host throttle; a failed call counts like a failed fetch.
   */
  const saleor = fetcher.postJson ? saleorConfig(merchant.adapterConfig) : null;
  const site = (() => {
    try {
      return new URL(merchant.baseUrl).origin;
    } catch {
      return merchant.baseUrl;
    }
  })();
  const callApi = async (body: unknown, what: string): Promise<unknown> => {
    const r = await fetcher.postJson!(saleor!.endpoint, body, { limits });
    requests += r.attempts;
    const tag = `api ${r.status || "ERR"} ${(r.ms / 1000).toFixed(1)}s`;
    const errors = (r.json as { errors?: { message?: string }[] } | undefined)?.errors;
    if (r.status === 0 || r.status >= 400 || r.json === undefined || errors?.length) {
      if (r.status === 403 || r.status === 429) {
        blockedFetches++;
        lastBlock = `api ${r.status}`;
      } else {
        errorFetches++;
        lastError = r.error ?? errors?.[0]?.message ?? `API HTTP ${r.status}`;
      }
      log(`  ✗ ${tag} ${lastError || lastBlock} ${what}`);
      return undefined;
    }
    okFetches++;
    log(`  · ${tag} ${what}`);
    return r.json;
  };

  const describe = (d: MatchDecision) =>
    `${d.decision} ${d.score}${d.vetoes.length ? ` veto ${d.vetoes.join(",")}` : ""} sim ${d.similarity.toFixed(2)}`;

  /** Fetch + extract + score one product page. Null when the page couldn't be loaded. */
  const evaluate = async (
    url: string,
    via: Scored["via"],
    pinned = false,
  ): Promise<Scored | null> => {
    if (saleor) {
      const slug = saleorSlugFromUrl(url);
      if (!slug) {
        log(`  ✗ no product slug in ${url}`);
        return null;
      }
      const node = saleorProductNode(
        await callApi(saleorProductBody(saleor, slug), `product ${slug}`),
      );
      if (node === undefined) return null;
      if (node === null) {
        log("  → the shop has no product with this slug any more");
        return null;
      }
      const offer = saleorOffer(node, site);
      const decision = matchOffer(target, offer, mm, { pinned });
      const price = offer.price ? `${offer.price.eur.toFixed(2)}€` : "no price";
      log(`  → ${describe(decision)} | ${price} ${offer.stock} | ${offer.title ?? "(no title)"}`);
      if (decision.warning) log(`  ⚠ pinned URL: the rules say ${decision.ruleDecision}`);
      return { offer, decision, via };
    }
    let r = await fetchPage(url, false);
    if (!usable(r)) return null;
    let offer = extractProductPage(r.html, r.finalUrl, extractOpts);
    if (!offer.title && !offer.price && r.via === "fetch" && fetcher.hasBrowser) {
      log("  page has no title or price: retrying in the browser (JS-rendered?)");
      r = await fetchPage(url, true);
      if (!usable(r)) return null;
      offer = extractProductPage(r.html, r.finalUrl, extractOpts);
    }
    const decision = matchOffer(target, offer, mm, { pinned });
    // A page that loaded but shows no price is usually a changed layout or a soft block (a
    // different page for datacenter IPs); keep it for the debug artifact.
    if (!offer.price && failurePages.length < 4)
      failurePages.push({ url, status: r.status, reason: "no price", html: r.html });
    const price = offer.price ? `${offer.price.eur.toFixed(2)}€` : "no price";
    log(`  → ${describe(decision)} | ${price} ${offer.stock} | ${offer.title ?? "(no title)"}`);
    if (decision.warning) log(`  ⚠ pinned URL: the rules say ${decision.ruleDecision}`);
    return { offer, decision, via };
  };

  const finish = (o: Omit<PairOutcome, "trace" | "failurePages" | "requests" | "ms">) => {
    const ms = opts.now() - started;
    log(`= ${o.status}: ${o.message} (${requests} requests, ${(ms / 1000).toFixed(1)}s)`);
    return { ...o, trace, failurePages, requests, ms };
  };

  const lastMatchOf = (s: Scored): LastMatch => ({
    score: s.decision.score,
    decision: s.decision.ruleDecision ?? s.decision.decision,
    vetoes: s.decision.vetoes,
    at: opts.now(),
  });

  const acceptedOutcome = (s: Scored, extra: Partial<PairOutcome> = {}) =>
    finish({
      status: s.offer.stock === "out_of_stock" ? "out_of_stock" : "ok",
      message: `${s.offer.price!.eur.toFixed(2)} € via ${s.via}${s.decision.warning ? " (pinned, rules disagree)" : ""}`,
      accepted: s,
      lastMatch: lastMatchOf(s),
      ...extra,
    });

  const failedFetchOutcome = () =>
    blockedFetches && !okFetches
      ? finish({ status: "blocked", message: `blocked (${lastBlock})` })
      : finish({ status: "error", message: lastError || "fetch failed" });

  // 1. Pinned URL: always used, never searched past (A16).
  if (state?.manualUrl) {
    log(`pinned ${state.manualUrl}`);
    const s = await evaluate(state.manualUrl, "manual", true);
    if (!s) return failedFetchOutcome();
    if (s.decision.decision === "accept") return acceptedOutcome(s);
    return finish({
      status: s.offer.stock === "out_of_stock" ? "out_of_stock" : "not_found",
      message: "pinned page has no price",
      lastMatch: lastMatchOf(s),
    });
  }

  let autoUrl: PairOutcome["autoUrl"];
  const seen = new Set<string>();
  const accepts: Scored[] = [];
  const reviews: Scored[] = [];
  const consider = (s: Scored | null) => {
    if (!s) return;
    if (s.decision.decision === "accept") accepts.push(s);
    else if (s.decision.decision === "review") reviews.push(s);
  };

  // 2. Revalidate the auto URL (A15).
  if (state?.autoUrl) {
    log(`auto ${state.autoUrl} (failures ${state.autoUrlFailures})`);
    seen.add(canonicalUrl(state.autoUrl));
    const s = await evaluate(state.autoUrl, "auto");
    if (s?.decision.decision === "accept") {
      return acceptedOutcome(s, { autoUrl: { url: state.autoUrl, failures: 0 } });
    }
    if (s) {
      // Only a page that loaded and didn't match counts against the URL, not a block.
      const next = nextAutoUrlState(state.autoUrlFailures, s.decision.decision);
      autoUrl = { url: next.drop ? null : state.autoUrl, failures: next.drop ? 0 : next.failures };
      log(
        next.drop ? "  auto URL dropped after 3 failures" : `  auto URL failure ${next.failures}`,
      );
      consider(s);
    }
  }

  // 3. Amazon: the ASIN known from another amazon.* shop.
  if (input.asin && isAmazonHost(merchant.baseUrl)) {
    const url = amazonProductUrl(merchant.baseUrl, input.asin);
    if (!seen.has(canonicalUrl(url))) {
      log(`asin ${url}`);
      seen.add(canonicalUrl(url));
      consider(await evaluate(url, "asin"));
    }
  }

  // 4. Search: GTIN → MPN → text, stopping at the first accept.
  if (saleor) {
    for (const query of accepts.length ? [] : searchQueries(target)) {
      log(`search ${query.kind} "${query.q}" (api)`);
      const nodes = saleorSearchNodes(await callApi(saleorSearchBody(saleor, query.q), "search"));
      if (!nodes) {
        if (blockedFetches) break;
        continue;
      }
      log(`  ${nodes.length} products`);
      for (const node of nodes) {
        const offer = saleorOffer(node, site);
        if (seen.has(offer.canonicalUrl)) continue;
        seen.add(offer.canonicalUrl);
        const decision = matchOffer(target, offer, mm);
        log(`  product → ${describe(decision)} | ${offer.title}`);
        consider({ offer, decision, via: "search" });
      }
      if (accepts.length) break;
    }
  }
  for (const query of accepts.length || saleor ? [] : searchQueries(target)) {
    const url = buildSearchUrl(merchant.searchTemplate, query.q);
    log(`search ${query.kind} "${query.q}"`);
    let r = await fetchPage(url, memo.jsSearch.has(merchant.id));
    if (r.blocked) break; // the next query would hit the same wall
    if (!usable(r)) continue;

    // The shop may redirect an exact (GTIN/MPN) search straight to the product page.
    if (!looksLikeSearchUrl(r.finalUrl) && canonicalUrl(r.finalUrl) !== canonicalUrl(url)) {
      const offer = extractProductPage(r.html, r.finalUrl, extractOpts);
      if (offer.pageKind === "product" && offer.title) {
        seen.add(canonicalUrl(r.finalUrl));
        const decision = matchOffer(target, offer, mm);
        log(`  redirected to a product page → ${describe(decision)}`);
        consider({ offer, decision, via: "search" });
        if (accepts.length) break;
        continue;
      }
    }

    let page = extractSearchPage(r.html, r.finalUrl, extractOpts);
    let filtered = prefilterLinks(target, page.links, mm);
    const looksEmpty = (p: typeof page, f: typeof filtered) =>
      !f.kept.length && !p.offers.length && f.dropped.filter((d) => d.similarity > 0).length < 3;
    // An empty GTIN/MPN result is normal, so only the text query (the broadest) probes whether
    // the shop renders its results with JS. A hit is remembered for the rest of the run.
    if (
      r.via === "fetch" &&
      fetcher.hasBrowser &&
      query.kind === "text" &&
      looksEmpty(page, filtered)
    ) {
      log("  no product cards in the plain HTML: retrying in the browser (JS-rendered?)");
      const rb = await fetchPage(url, true);
      if (usable(rb)) {
        const pb = extractSearchPage(rb.html, rb.finalUrl, extractOpts);
        const fb = prefilterLinks(target, pb.links, mm);
        if (!looksEmpty(pb, fb)) memo.jsSearch.add(merchant.id);
        r = rb;
        page = pb;
        filtered = fb;
      }
    }
    log(
      `  ${page.linkCount} links, ${page.offers.length} listing offers, kept ${filtered.kept.length}`,
    );
    for (const d of filtered.dropped.filter((d) => d.similarity > 0).slice(0, MAX_TRACE_DROPS))
      log(`  - drop ${d.rule} (${d.evidence}) ${d.text.slice(0, 80)}`);

    for (const offer of page.offers) {
      const decision = matchOffer(target, offer, mm);
      if (decision.decision === "review") {
        log(`  listing → ${describe(decision)} | ${offer.title}`);
        reviews.push({ offer, decision, via: "search" });
      }
    }
    for (const link of filtered.kept) {
      const key = canonicalUrl(link.url);
      if (seen.has(key)) continue;
      seen.add(key);
      log(`  link ${link.similarity} ${link.url}`);
      consider(await evaluate(link.url, "search"));
    }
    if (accepts.length) break;
  }

  // 5. One offer per pair per run (B15).
  const best = selectBestOffer(accepts);
  if (best) {
    const changed = best.via !== "auto" || !state?.autoUrl;
    return acceptedOutcome(best, {
      autoUrl: changed ? { url: best.offer.canonicalUrl, failures: 0 } : autoUrl,
    });
  }
  if (!okFetches) return { ...failedFetchOutcome(), autoUrl };

  const review = reviews.sort((a, b) => b.decision.score - a.decision.score)[0];
  // A wall part-way through (a search or a product page) means "not found" can't be trusted.
  if (blockedFetches) {
    return finish({
      status: "blocked",
      message: `blocked part-way (${lastBlock})${review ? `; review candidate ${review.decision.score}` : ""}`,
      review,
      lastMatch: review ? lastMatchOf(review) : undefined,
      autoUrl,
    });
  }
  return finish({
    status: "not_found",
    message: review
      ? `review candidate ${review.decision.score}: ${review.offer.title ?? review.offer.url}`
      : "no matching offer",
    review,
    lastMatch: review ? lastMatchOf(review) : undefined,
    autoUrl,
  });
}
