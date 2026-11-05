/**
 * Page fetching: plain `fetch` first, Playwright when the merchant needs a browser or the shop
 * answers with an anti-bot status. Never solves CAPTCHAs: a page that still blocks is reported
 * as `blocked` and the caller moves on.
 */
import { clampLimits, HostLimiter, realClock, type Clock, type HostLimits } from "./limiter";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

/** Statuses that usually mean "a bot was detected"; they trigger the browser fallback. */
export const ANTI_BOT_STATUSES = new Set([202, 403, 429, 503]);
/** Statuses worth retrying with backoff before giving up on plain fetch. */
export const RETRY_STATUSES = new Set([202, 429]);

export type FetchVia = "fetch" | "browser";

/** One raw request: what a transport (fetch or Playwright) returns. */
export interface RawResponse {
  status: number;
  html: string;
  finalUrl: string;
  /** Seconds, from a Retry-After header. */
  retryAfter?: number;
}

export type Transport = (url: string) => Promise<RawResponse>;

export interface FetchResult {
  url: string;
  finalUrl: string;
  /** HTTP status, or 0 when the request failed (network error, timeout). */
  status: number;
  html: string;
  via: FetchVia;
  /** Set when the shop still blocks after every fallback (anti-bot status or challenge page). */
  blocked?: string;
  error?: string;
  attempts: number;
  ms: number;
}

export interface FetchOptions {
  /** Go straight to the browser (merchant `needsBrowser`, or a JS-rendered page). */
  browser?: boolean;
  limits?: HostLimits;
}

export interface PageFetcher {
  get(url: string, options?: FetchOptions): Promise<FetchResult>;
  /** POST a JSON body to a shop's public API (same per-host throttle). Optional for fakes. */
  postJson?(url: string, body: unknown, options?: { limits?: HostLimits }): Promise<JsonResult>;
  readonly hasBrowser: boolean;
}

export interface JsonResult {
  /** HTTP status, or 0 when the request failed. */
  status: number;
  json?: unknown;
  error?: string;
  attempts: number;
  ms: number;
}

export type JsonTransport = (
  url: string,
  body: unknown,
) => Promise<{ status: number; json?: unknown }>;

/** Native fetch POSTing JSON, with a timeout. */
export function jsonTransport(timeoutMs = 25_000): JsonTransport {
  return async (url, body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  };
}

const CHALLENGE_MARKERS: [RegExp, string][] = [
  // Amazon: /errors/validateCaptcha, or /errors_page/validateCaptcha ("Haz clic en el botón…").
  [
    /\/errors(?:_page)?\/validateCaptcha|captcha-delivery\.com|px-captcha|g-recaptcha|h-captcha/i,
    "captcha",
  ],
  [/cf-chl-|challenge-platform|<title>\s*(just a moment|attention required)/i, "cloudflare"],
  [/<title>\s*(access denied|403 forbidden|request rejected)/i, "access denied"],
];

/** Why a response looks like a bot wall, or null. */
export function blockReason(status: number, html: string): string | null {
  // Large real pages can mention "captcha" in a script; only short pages are walls by content.
  if (html.length < 200_000) {
    for (const [re, reason] of CHALLENGE_MARKERS) if (re.test(html)) return reason;
  }
  if (ANTI_BOT_STATUSES.has(status)) return `HTTP ${status}`;
  return null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Native fetch with browser-like headers and a timeout. */
export function plainTransport(timeoutMs = 25_000): Transport {
  return async (url) => {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const retryAfter = Number(res.headers.get("retry-after"));
    return {
      status: res.status,
      html: await res.text(),
      finalUrl: res.url || url,
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    };
  };
}

export interface SmartFetcherOptions {
  plain: Transport;
  /** Playwright transport; null when no browser is available (tests, `--no-browser`). */
  browser?: Transport | null;
  limiter?: HostLimiter;
  clock?: Clock;
  /** Plain-fetch retries on 429/202 (default 2). */
  retries?: number;
  /** First backoff in ms, doubled each retry (default 3000). Retry-After wins when longer. */
  backoffMs?: number;
  /** JSON API transport (default: native fetch). */
  json?: JsonTransport;
}

const MAX_BACKOFF_MS = 30_000;

export class SmartFetcher implements PageFetcher {
  private limiter: HostLimiter;
  private clock: Clock;
  constructor(private options: SmartFetcherOptions) {
    this.clock = options.clock ?? realClock;
    this.limiter = options.limiter ?? new HostLimiter(this.clock);
  }

  get hasBrowser() {
    return !!this.options.browser;
  }

  private async attempt(
    via: FetchVia,
    transport: Transport,
    url: string,
    limits: HostLimits,
  ): Promise<RawResponse & { error?: string }> {
    try {
      return await this.limiter.run(hostOf(url), limits, () => transport(url));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { status: 0, html: "", finalUrl: url, error: `${via}: ${error}` };
    }
  }

  async get(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const started = this.clock.now();
    const limits = options.limits ?? clampLimits();
    const browser = this.options.browser;
    let attempts = 0;
    const done = (r: RawResponse & { error?: string }, via: FetchVia): FetchResult => {
      const blocked = r.status === 0 ? null : blockReason(r.status, r.html);
      return {
        url,
        finalUrl: r.finalUrl,
        status: r.status,
        html: r.html,
        via,
        ...(blocked ? { blocked } : {}),
        ...(r.error ? { error: r.error } : {}),
        attempts,
        ms: this.clock.now() - started,
      };
    };

    if (!(options.browser && browser)) {
      const retries = this.options.retries ?? 2;
      const backoff = this.options.backoffMs ?? 3000;
      let r: RawResponse & { error?: string } = { status: 0, html: "", finalUrl: url };
      for (let i = 0; i <= retries; i++) {
        attempts++;
        r = await this.attempt("fetch", this.options.plain, url, limits);
        if (!RETRY_STATUSES.has(r.status) || i === retries) break;
        const wait = Math.min(
          MAX_BACKOFF_MS,
          Math.max(backoff * 2 ** i, (r.retryAfter ?? 0) * 1000),
        );
        await this.clock.sleep(wait);
      }
      const blocked = r.status === 0 ? null : blockReason(r.status, r.html);
      // Fall back to the browser only for bot walls and network failures, not 404s.
      if (!browser || (r.status !== 0 && !blocked)) return done(r, "fetch");
    }

    attempts++;
    const r = await this.attempt("browser", browser!, url, limits);
    return done(r, "browser");
  }

  async postJson(
    url: string,
    body: unknown,
    options: { limits?: HostLimits } = {},
  ): Promise<JsonResult> {
    const started = this.clock.now();
    const transport = this.options.json ?? jsonTransport();
    try {
      const r = await this.limiter.run(hostOf(url), options.limits ?? clampLimits(), () =>
        transport(url, body),
      );
      return { ...r, attempts: 1, ms: this.clock.now() - started };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { status: 0, error: `api: ${error}`, attempts: 1, ms: this.clock.now() - started };
    }
  }
}
