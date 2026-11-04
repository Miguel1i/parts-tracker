/**
 * Playwright (Chromium) transport. Launched lazily on first use, one browser context per host so
 * cookies stay per shop. It looks like a normal desktop Chrome (UA, pt-PT locale, no
 * `navigator.webdriver`) but never interacts with CAPTCHAs: a challenge page is returned as is
 * and the fetcher reports it as blocked.
 */
import type { Browser, BrowserContext } from "playwright";
import { ANTI_BOT_STATUSES, blockReason, BROWSER_HEADERS, hostOf, USER_AGENT } from "./http";
import type { RawResponse, Transport } from "./http";

export const INIT_SCRIPT = `
Object.defineProperty(Navigator.prototype, "webdriver", { get: () => undefined, configurable: true });
`;

export interface BrowserSession {
  transport: Transport;
  close(): Promise<void>;
}

export function createBrowserSession(options: { headless?: boolean } = {}): BrowserSession {
  let browser: Promise<Browser> | undefined;
  const contexts = new Map<string, Promise<BrowserContext>>();

  const launch = () =>
    (browser ??= import("playwright").then(({ chromium }) =>
      chromium.launch({
        headless: options.headless ?? true,
        args: ["--disable-blink-features=AutomationControlled"],
      }),
    ));

  const contextFor = (host: string) => {
    let ctx = contexts.get(host);
    if (!ctx) {
      ctx = launch().then(async (b) => {
        const c = await b.newContext({
          userAgent: USER_AGENT,
          locale: "pt-PT",
          timezoneId: "Europe/Lisbon",
          viewport: { width: 1366, height: 900 },
          extraHTTPHeaders: { "Accept-Language": BROWSER_HEADERS["Accept-Language"]! },
        });
        await c.addInitScript(INIT_SCRIPT);
        // Images, fonts and media are never read; skipping them keeps runs fast and light.
        await c.route("**/*", (route) =>
          ["image", "font", "media"].includes(route.request().resourceType())
            ? route.abort()
            : route.continue(),
        );
        return c;
      });
      contexts.set(host, ctx);
    }
    return ctx;
  };

  const transport: Transport = async (url): Promise<RawResponse> => {
    const ctx = await contextFor(hostOf(url));
    const page = await ctx.newPage();
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      let status = res?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      let html = await page.content();
      // A JS challenge that a normal browser passes on its own resolves within a few seconds;
      // wait for it once. Interactive CAPTCHAs stay blocked.
      if (blockReason(status, html) === "cloudflare") {
        await page.waitForTimeout(8_000);
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        html = await page.content();
      }
      if (ANTI_BOT_STATUSES.has(status) && !blockReason(200, html) && html.length > 5_000)
        status = 200;
      return { status, html, finalUrl: page.url() };
    } finally {
      await page.close().catch(() => {});
    }
  };

  return {
    transport,
    async close() {
      if (!browser) return;
      const b = await browser.catch(() => null);
      await b?.close().catch(() => {});
    },
  };
}
