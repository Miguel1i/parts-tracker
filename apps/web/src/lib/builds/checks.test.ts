import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appSettings,
  buildItems,
  builds,
  createDb,
  matchCandidates,
  merchants,
  pricePoints,
  productMerchant,
  products,
  scrapeRuns,
  user,
  userMerchants,
} from "@parts/db";
import { runMigrations } from "@parts/db/migrate";
import { eq } from "@parts/db/orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// guard.ts (ActionError) pulls in the auth stack; none of it is used here.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/root-params", () => ({ locale: async () => "en" }));
vi.mock("@/i18n/server", () => ({ initLocale: async () => "en" }));
vi.mock("@/lib/auth/server", () => ({ auth: { api: {} } }));

const github = vi.hoisted(() => ({ dispatchScrape: vi.fn() }));
vi.mock("@/lib/admin/github", () => github);

import { reportMatch, runStatus, startCheck } from "./checks";

const dir = mkdtempSync(join(tmpdir(), "parts-checks-"));
const db = createDb(`file:${join(dir, "t.db").replaceAll("\\", "/")}`);
const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000);

beforeAll(async () => {
  await runMigrations(db);
  await db.insert(user).values([
    { id: "u1", name: "U", email: "u@example.com", status: "active" },
    { id: "u2", name: "V", email: "v@example.com", status: "active" },
  ]);
  await db.insert(merchants).values({
    id: "m1",
    name: "Shop",
    slug: "shop",
    baseUrl: "https://shop.example",
    searchTemplate: "https://shop.example/s?q={q}",
  });
  await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
  await db
    .update(appSettings)
    .set({ userRunCooldownMinutes: 10, recentCheckSkipMinutes: 30 })
    .where(eq(appSettings.id, 1));
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may hold the handle briefly.
  }
});

beforeEach(async () => {
  github.dispatchScrape.mockReset();
  github.dispatchScrape.mockResolvedValue({ dispatched: true });
  await db.insert(builds).values({ id: "b1", userId: "u1", name: "Build" });
  await db.insert(products).values({ id: "p1", name: "CPU", query: "cpu" });
  await db.insert(buildItems).values({ buildId: "b1", productId: "p1" });
});

afterEach(async () => {
  await db.delete(scrapeRuns);
  await db.delete(matchCandidates);
  await db.delete(pricePoints);
  await db.delete(userMerchants);
  await db.delete(productMerchant);
  await db.delete(builds);
  await db.delete(products);
});

const check = (
  isAdmin = false,
  actor = "u1",
  scope: Parameters<typeof startCheck>[3] = { buildId: "b1" },
) => startCheck(db, { id: actor }, isAdmin, scope, now);

describe("startCheck", () => {
  it("queues a manual run, dispatches it and returns the run id", async () => {
    const r = await check();
    expect(r).toMatchObject({ dispatched: true });
    const [run] = await db.select().from(scrapeRuns);
    expect(run).toMatchObject({
      id: r.runId,
      trigger: "manual",
      status: "queued",
      requestedBy: "u1",
      scope: { buildId: "b1" },
    });
    expect(github.dispatchScrape).toHaveBeenCalledWith({ runId: r.runId, buildId: "b1" });
  });

  it("refuses another user's build as notFound", async () => {
    await expect(check(false, "u2")).rejects.toMatchObject({ code: "notFound" });
    expect(github.dispatchScrape).not.toHaveBeenCalled();
  });

  it("rate-limits users within the cooldown, but not admins", async () => {
    await db.insert(scrapeRuns).values({
      trigger: "manual",
      status: "succeeded",
      requestedBy: "u1",
      createdAt: minutesAgo(4),
    });
    await expect(check()).rejects.toMatchObject({
      code: "rateLimited",
      meta: { retryAfterSec: 360 },
    });
    await expect(check(true)).resolves.toMatchObject({ dispatched: true });
  });

  it("ignores other users' runs and runs older than the cooldown", async () => {
    await db.insert(scrapeRuns).values([
      { trigger: "manual", status: "succeeded", requestedBy: "u2", createdAt: minutesAgo(1) },
      { trigger: "manual", status: "succeeded", requestedBy: "u1", createdAt: minutesAgo(11) },
    ]);
    await expect(check()).resolves.toMatchObject({ dispatched: true });
  });

  it("answers nothingToCheck when every pair was checked recently", async () => {
    await db.insert(productMerchant).values({
      productId: "p1",
      merchantId: "m1",
      lastStatus: "ok",
      lastPriceEur: 10,
      lastCheckedAt: minutesAgo(5),
    });
    await expect(check()).rejects.toMatchObject({ code: "nothingToCheck" });
    expect(await db.select().from(scrapeRuns)).toHaveLength(0);
    // Stale pairs are checked again.
    await db.update(productMerchant).set({ lastCheckedAt: minutesAgo(45) });
    await expect(check()).resolves.toMatchObject({ dispatched: true });
  });

  it("only counts merchants the user compares, and an empty build has nothing to check", async () => {
    await db.insert(userMerchants).values({ userId: "u1", merchantId: "m1", enabled: false });
    await expect(check()).rejects.toMatchObject({ code: "nothingToCheck" });
    await db.delete(userMerchants);
    await db.delete(buildItems);
    await expect(check()).rejects.toMatchObject({ code: "nothingToCheck" });
  });

  it("marks the run failed and throws dispatchFailed when GitHub refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    github.dispatchScrape.mockRejectedValue(new Error("HTTP 401"));
    await expect(check()).rejects.toMatchObject({ code: "dispatchFailed" });
    const [run] = await db.select().from(scrapeRuns);
    expect(run!.status).toBe("failed");
    expect(run!.finishedAt).toBeInstanceOf(Date);
    // The user may retry straight away: a run GitHub never accepted isn't a check.
    github.dispatchScrape.mockResolvedValue({ dispatched: true });
    await expect(check()).resolves.toMatchObject({ dispatched: true });
  });

  it("returns the local command to admins only", async () => {
    github.dispatchScrape.mockResolvedValue({ dispatched: false, command: "pnpm scrape --x" });
    const user1 = await check(false);
    expect(user1).toEqual({ runId: user1.runId, dispatched: false });
    const admin = await check(true);
    expect(admin).toMatchObject({ dispatched: false, command: "pnpm scrape --x" });
  });

  it("checks one product", async () => {
    const r = await check(false, "u1", { productId: "p1" });
    expect(github.dispatchScrape).toHaveBeenCalledWith({ runId: r.runId, productId: "p1" });
    await expect(check(true, "u1", { productId: "nope" })).rejects.toMatchObject({
      code: "notFound",
    });
  });
});

describe("runStatus", () => {
  it("shows a run to its requester and to admins only", async () => {
    const { runId } = await check();
    await expect(runStatus(db, { id: "u1" }, false, runId)).resolves.toMatchObject({
      status: "queued",
      logs: [],
    });
    await expect(runStatus(db, { id: "u2" }, false, runId)).rejects.toMatchObject({
      code: "notFound",
    });
    await expect(runStatus(db, { id: "u2" }, true, runId)).resolves.toMatchObject({
      status: "queued",
    });
    await expect(runStatus(db, { id: "u1" }, false, "missing")).rejects.toMatchObject({
      code: "notFound",
    });
  });
});

describe("reportMatch", () => {
  const input = { buildId: "b1", productId: "p1", merchantId: "m1", reason: "Wrong CPU" };

  it("needs the product in the build and a URL for the pair", async () => {
    await expect(reportMatch(db, "u1", { ...input, productId: "other" })).rejects.toMatchObject({
      code: "notFound",
    });
    await db.insert(productMerchant).values({ productId: "p1", merchantId: "m1" });
    await expect(reportMatch(db, "u1", input)).rejects.toMatchObject({ code: "notFound" });
  });

  it("files a pending report once, using the pinned URL first", async () => {
    await db.insert(productMerchant).values({
      productId: "p1",
      merchantId: "m1",
      autoUrl: "https://shop.example/auto",
      manualUrl: "https://shop.example/pinned",
      lastMatch: { score: 0.8, decision: "accept", vetoes: [], at: 1 },
    });
    await db.insert(pricePoints).values({
      productId: "p1",
      merchantId: "m1",
      ts: new Date(),
      priceEur: 99,
      url: "https://shop.example/seen",
      title: "Seen title",
    });
    await reportMatch(db, "u1", input);
    const [c] = await db.select().from(matchCandidates);
    expect(c).toMatchObject({
      url: "https://shop.example/pinned",
      title: "Seen title",
      priceEur: 99,
      score: 0.8,
      status: "pending",
    });
    expect(c!.signals).toMatchObject({
      stage: "report",
      report: { userId: "u1", reason: "Wrong CPU" },
    });
    await expect(reportMatch(db, "u1", input)).rejects.toMatchObject({ code: "alreadyReported" });
  });

  it("falls back to the latest price point's URL", async () => {
    await db.insert(productMerchant).values({ productId: "p1", merchantId: "m1" });
    await db.insert(pricePoints).values({
      productId: "p1",
      merchantId: "m1",
      ts: new Date(),
      priceEur: 5,
      url: "https://shop.example/seen",
    });
    await reportMatch(db, "u1", { buildId: "b1", productId: "p1", merchantId: "m1" });
    const [c] = await db.select().from(matchCandidates);
    expect(c).toMatchObject({ url: "https://shop.example/seen", score: 0 });
  });
});
