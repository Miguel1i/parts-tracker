import { describe, expect, it } from "vitest";
import { blockReason, SmartFetcher, type RawResponse, type Transport } from "../src/http";
import { clampLimits, HostLimiter, type Clock } from "../src/limiter";

/** A clock whose sleep advances time instantly. */
function fakeClock(): Clock & { slept: number[] } {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
  };
}

const page = (status: number, html = "<html><title>Produto</title></html>"): RawResponse => ({
  status,
  html,
  finalUrl: "",
});

function scripted(responses: RawResponse[]): Transport & { urls: string[] } {
  const urls: string[] = [];
  const t = (async (url: string) => {
    urls.push(url);
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    return { ...r, finalUrl: r.finalUrl || url };
  }) as Transport & { urls: string[] };
  t.urls = urls;
  return t;
}

describe("HostLimiter", () => {
  it("spaces requests to one host by at least the gap", async () => {
    const clock = fakeClock();
    const limiter = new HostLimiter(clock);
    const starts: number[] = [];
    const limits = { gapMs: 1500, maxConcurrent: 2 };
    await Promise.all(
      [1, 2, 3].map(() =>
        limiter.run("shop.pt", limits, async () => void starts.push(clock.now())),
      ),
    );
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1500);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1500);
  });

  it("does not delay different hosts", async () => {
    const clock = fakeClock();
    const limiter = new HostLimiter(clock);
    const limits = { gapMs: 1500, maxConcurrent: 2 };
    await limiter.run("a.pt", limits, async () => {});
    await limiter.run("b.pt", limits, async () => {});
    expect(clock.slept).toEqual([]);
  });

  it("allows at most maxConcurrent in flight", async () => {
    const limiter = new HostLimiter({ now: () => 0, sleep: async () => {} });
    let active = 0;
    let peak = 0;
    const task = () =>
      limiter.run("shop.pt", { gapMs: 0, maxConcurrent: 2 }, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBe(2);
  });

  it("never lets a merchant config loosen the defaults", () => {
    expect(clampLimits({ throttleMs: 200, maxConcurrency: 8 })).toEqual({
      gapMs: 1500,
      maxConcurrent: 2,
    });
    expect(clampLimits({ throttleMs: 4000, maxConcurrency: 1 })).toEqual({
      gapMs: 4000,
      maxConcurrent: 1,
    });
  });
});

describe("blockReason", () => {
  it("flags anti-bot statuses and challenge pages", () => {
    expect(blockReason(403, "<html></html>")).toBe("HTTP 403");
    expect(blockReason(200, "<title>Just a moment...</title>")).toBe("cloudflare");
    expect(blockReason(200, '<form action="/errors/validateCaptcha">')).toBe("captcha");
    // What Amazon.es served a GitHub runner, with HTTP 200 (2026-11-04).
    expect(
      blockReason(200, '<form method="get" action="/errors_page/validateCaptcha" name="">'),
    ).toBe("captcha");
    expect(blockReason(200, "<title>AMD Ryzen 7 9800X3D</title>")).toBeNull();
    expect(blockReason(404, "not here")).toBeNull();
  });
});

describe("SmartFetcher", () => {
  const url = "https://www.shop.pt/p/1";

  it("retries 429 with exponential backoff, honouring Retry-After", async () => {
    const clock = fakeClock();
    const plain = scripted([{ ...page(429), retryAfter: 10 }, page(429), page(200)]);
    const f = new SmartFetcher({ plain, clock, backoffMs: 1000 });
    const r = await f.get(url);
    expect(r).toMatchObject({ status: 200, via: "fetch", attempts: 3 });
    expect(r.blocked).toBeUndefined();
    expect(clock.slept).toContain(10_000); // Retry-After beat the 1 s backoff
    expect(clock.slept).toContain(2000); // the second backoff doubled
  });

  it("falls back to the browser on 403", async () => {
    const plain = scripted([page(403)]);
    const browser = scripted([page(200)]);
    const r = await new SmartFetcher({ plain, browser, clock: fakeClock() }).get(url);
    expect(r).toMatchObject({ status: 200, via: "browser", attempts: 2 });
    expect(browser.urls).toEqual([url]);
  });

  it("reports blocked when the browser is blocked too", async () => {
    const plain = scripted([page(403)]);
    const browser = scripted([page(200, "<title>Just a moment...</title>")]);
    const r = await new SmartFetcher({ plain, browser, clock: fakeClock() }).get(url);
    expect(r.blocked).toBe("cloudflare");
  });

  it("reports blocked without a browser", async () => {
    const plain = scripted([page(503)]);
    const r = await new SmartFetcher({ plain, clock: fakeClock() }).get(url);
    expect(r).toMatchObject({ status: 503, blocked: "HTTP 503", via: "fetch" });
  });

  it("does not use the browser for a 404", async () => {
    const plain = scripted([page(404)]);
    const browser = scripted([]);
    const r = await new SmartFetcher({ plain, browser, clock: fakeClock() }).get(url);
    expect(r).toMatchObject({ status: 404, via: "fetch" });
    expect(browser.urls).toEqual([]);
  });

  it("goes straight to the browser when asked (needsBrowser)", async () => {
    const plain = scripted([]);
    const browser = scripted([page(200)]);
    const r = await new SmartFetcher({ plain, browser, clock: fakeClock() }).get(url, {
      browser: true,
    });
    expect(r.via).toBe("browser");
    expect(plain.urls).toEqual([]);
  });

  it("turns network errors into status 0 and tries the browser", async () => {
    const browser = scripted([page(200)]);
    const r = await new SmartFetcher({ plain: scripted([]), browser, clock: fakeClock() }).get(url);
    expect(r).toMatchObject({ status: 200, via: "browser" });
    const noBrowser = await new SmartFetcher({ plain: scripted([]), clock: fakeClock() }).get(url);
    expect(noBrowser.status).toBe(0);
    expect(noBrowser.error).toMatch(/no more responses/);
  });
});
