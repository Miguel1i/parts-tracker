import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDb,
  matchCandidates,
  merchants,
  pricePoints,
  productIdentifiers,
  productMerchant,
  products,
  scrapeLogs,
  scrapeRuns,
  type Db,
} from "@parts/db";
import { runMigrations } from "@parts/db/migrate";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpu } from "../../core/test/products";
import { loadRates } from "../src/fx";
import { runScrape, withRetry } from "../src/run";
import { FakeFetcher, globaldataRoutes, GLOBALDATA_PAGE } from "./helpers";

// A temp file rather than :memory:, because libsql runs transactions on another connection.
const dir = mkdtempSync(join(tmpdir(), "parts-scraper-"));
let db: Db;
let n = 0;
let productId: string;
let gdId: string;
let blockedId: string;
const T0 = new Date("2026-11-03T12:00:00Z").getTime();

beforeEach(async () => {
  db = createDb(`file:${join(dir, `run-${n++}.db`).replaceAll("\\", "/")}`);
  await runMigrations(db);
  const [p] = await db
    .insert(products)
    .values({
      name: cpu.name,
      query: cpu.query!,
      brand: "AMD",
      category: "CPU",
      refPrice: 399.9,
      matchSpec: { packaging: "box" },
    })
    .returning();
  productId = p!.id;
  await db.insert(productIdentifiers).values(
    cpu.identifiers.map((i) => ({
      productId,
      kind: i.kind,
      value: i.value,
      source: i.source,
      confirmed: i.confirmed,
      confidence: i.confidence ?? 1,
    })),
  );
  const [gd, blocked] = await db
    .insert(merchants)
    .values([
      {
        name: "Globaldata",
        slug: "globaldata",
        country: "PT",
        baseUrl: "https://www.globaldata.pt",
        searchTemplate: "https://www.globaldata.pt/search?q={q}&search-button=&lang=pt_PT",
        shipping: 5,
        freeShippingOver: 50,
      },
      {
        name: "Chipman",
        slug: "chipman",
        country: "PT",
        baseUrl: "https://chipman.pt",
        searchTemplate: "https://chipman.pt/pesquisa?q={q}",
      },
      {
        name: "Disabled",
        slug: "disabled",
        baseUrl: "https://off.pt",
        searchTemplate: "https://off.pt/?q={q}",
        enabled: false,
      },
    ])
    .returning();
  gdId = gd!.id;
  blockedId = blocked!.id;
});

afterEach(() => db.$client.close());
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file; the OS temp cleaner gets it.
  }
});

const fetcher = () =>
  new FakeFetcher({
    ...globaldataRoutes,
    "https://chipman.pt/": { status: 403, html: "<title>Just a moment...</title>" },
  });

describe("runScrape", () => {
  it("writes prices, logs, pair state, learned codes and the run row", async () => {
    let t = T0;
    const failed: string[] = [];
    const result = await runScrape({
      db,
      fetcher: fetcher(),
      rates: { EUR: 1 },
      trigger: "cron",
      now: () => (t += 10),
      onFailurePage: (pair, page) => void failed.push(`${pair.merchant.slug} ${page.reason}`),
    });

    expect(result.stats).toMatchObject({ pairs: 2, ok: 1, blocked: 1, not_found: 0 });

    const points = await db.select().from(pricePoints);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      productId,
      merchantId: gdId,
      priceEur: 456.9,
      priceOrig: null,
      currency: "EUR",
      shipping: 0, // over the free-shipping threshold
      inStock: true,
      url: GLOBALDATA_PAGE,
      runId: result.runId,
    });

    const pairs = await db.select().from(productMerchant);
    const gd = pairs.find((p) => p.merchantId === gdId)!;
    expect(gd).toMatchObject({ lastStatus: "ok", lastPriceEur: 456.9, autoUrl: GLOBALDATA_PAGE });
    expect(gd.lastMatch?.decision).toBe("accept");
    expect(pairs.find((p) => p.merchantId === blockedId)?.lastStatus).toBe("blocked");

    const logs = await db.select().from(scrapeLogs);
    expect(logs.map((l) => l.status).sort()).toEqual(["blocked", "ok"]);
    expect(logs.find((l) => l.status === "ok")!.log).toMatch(/search gtin/);
    // Raw HTML only goes to the debug hook, never the DB.
    expect(logs.every((l) => !l.log?.includes("<title>"))).toBe(true);
    expect(failed).toEqual(["chipman cloudflare"]);

    // B: the boxed page teaches its own GTIN and penalizes the tray GTIN learned from PCBem.
    const ids = await db.select().from(productIdentifiers);
    expect(ids.find((i) => i.value === "00730143315289")).toMatchObject({
      source: "learned",
      confirmed: false,
      sourceMerchantId: gdId,
    });
    expect(ids.find((i) => i.value === "05606628885125")?.confidence).toBe(0.5);

    const [run] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, result.runId));
    expect(run).toMatchObject({ status: "succeeded", trigger: "cron" });
    expect(run!.finishedAt).toBeInstanceOf(Date);

    const health = await db.select().from(merchants);
    expect(health.find((m) => m.id === gdId)?.lastHealth).toBe("ok");
    expect(health.find((m) => m.id === blockedId)?.lastHealth).toBe("blocked");
  });

  it("updates a queued run row and honours the scope", async () => {
    await db.insert(scrapeRuns).values({ id: "run-1", trigger: "manual", scope: {} });
    const f = fetcher();
    const result = await runScrape({
      db,
      fetcher: f,
      rates: { EUR: 1 },
      trigger: "manual",
      runId: "run-1",
      scope: { productId, merchantId: gdId },
      ghRunUrl: "https://github.com/x/y/actions/runs/1",
    });
    expect(result.runId).toBe("run-1");
    expect(f.calls.every((c) => c.url.includes("globaldata"))).toBe(true);
    const [run] = await db.select().from(scrapeRuns);
    expect(run).toMatchObject({
      id: "run-1",
      status: "succeeded",
      ghRunUrl: "https://github.com/x/y/actions/runs/1",
    });
  });

  it("skips disabled pairs and pairs checked recently on manual runs", async () => {
    await db.insert(productMerchant).values([
      { productId, merchantId: blockedId, enabled: false },
      { productId, merchantId: gdId, lastCheckedAt: new Date(T0 - 5 * 60_000) },
    ]);
    const result = await runScrape({
      db,
      fetcher: fetcher(),
      rates: { EUR: 1 },
      trigger: "manual",
      now: () => T0,
    });
    expect(result.stats).toMatchObject({ pairs: 0, skipped: 1 });
  });

  it("writes a pending review candidate once per pair and URL", async () => {
    await db
      .update(products)
      .set({ name: "AMD Ryzen 7 9800X3D Gaming Edition", query: "AMD Ryzen 7 9800X3D Edition" })
      .where(eq(products.id, productId));
    await db.delete(productIdentifiers);
    const scope = { merchantId: gdId };
    await runScrape({ db, fetcher: fetcher(), rates: { EUR: 1 }, trigger: "cron", scope });
    await runScrape({ db, fetcher: fetcher(), rates: { EUR: 1 }, trigger: "cron", scope });
    const rows = await db.select().from(matchCandidates);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", url: GLOBALDATA_PAGE });
    expect(rows[0]!.score).toBeGreaterThanOrEqual(45);
    expect((rows[0]!.signals as { results: unknown[] }).results.length).toBeGreaterThan(3);
    expect(await db.select().from(pricePoints)).toHaveLength(0);
  });
});

describe("DB write failures", () => {
  it("retries a dropped connection, then keeps going past a pair it can't save", async () => {
    let failures = 2; // the first two transactions fail like a dropped Turso socket
    const realTx = db.transaction.bind(db);
    db.transaction = ((fn: Parameters<typeof db.transaction>[0]) => {
      if (failures-- > 0) return Promise.reject(new Error("fetch failed: other side closed"));
      return realTx(fn);
    }) as typeof db.transaction;
    const result = await runScrape({
      db,
      fetcher: fetcher(),
      rates: { EUR: 1 },
      trigger: "cron",
      sleep: async () => {},
    });
    expect(result.stats).toMatchObject({ pairs: 2, writeErrors: 0 });
    expect(await db.select().from(scrapeLogs)).toHaveLength(2);

    failures = 100;
    const lines: string[] = [];
    const second = await runScrape({
      db,
      fetcher: fetcher(),
      rates: { EUR: 1 },
      trigger: "cron",
      sleep: async () => {},
      log: (l) => lines.push(l),
    });
    expect(second.stats.writeErrors).toBe(2);
    expect(lines.join("\n")).toMatch(/could not save .*other side closed/);
    const [run] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, second.runId));
    expect(run!.status).toBe("succeeded");
  });

  it("withRetry gives up after the last attempt", async () => {
    let calls = 0;
    const fail = () => {
      calls++;
      return Promise.reject(new Error("down"));
    };
    await expect(withRetry(fail, { attempts: 3, sleep: async () => {} })).rejects.toThrow("down");
    expect(calls).toBe(3);
  });
});

describe("loadRates", () => {
  it("downloads once, then serves the cache for 6 hours", async () => {
    let calls = 0;
    const fetchText = async () => {
      calls++;
      return "<Cube currency='GBP' rate='0.84'/><Cube currency='USD' rate='1.08'/>";
    };
    const t = new Date(T0);
    expect(await loadRates(db, { now: t, fetchText })).toEqual({ GBP: 0.84, USD: 1.08, EUR: 1 });
    await loadRates(db, { now: new Date(T0 + 3_600_000), fetchText });
    expect(calls).toBe(1);
    await loadRates(db, { now: new Date(T0 + 7 * 3_600_000), fetchText });
    expect(calls).toBe(2);
  });

  it("falls back to stored rates when the ECB is down", async () => {
    await loadRates(db, {
      now: new Date(T0),
      fetchText: async () => "<Cube currency='GBP' rate='0.84'/>",
    });
    const rates = await loadRates(db, {
      now: new Date(T0 + 7 * 3_600_000),
      fetchText: async () => {
        throw new Error("down");
      },
    });
    expect(rates).toEqual({ GBP: 0.84, EUR: 1 });
  });
});
