import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildItems,
  builds,
  createDb,
  merchants,
  productIdentifiers,
  productMerchant,
  products,
  user,
} from "@parts/db";
import { runMigrations } from "@parts/db/migrate";
import { and, eq } from "@parts/db/orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addProductByUrl, addToBuild, importPcppList } from "./add-product";

// guard.ts (ActionError) pulls in the auth stack; none of it is used here.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/root-params", () => ({ locale: async () => "en" }));
vi.mock("@/i18n/server", () => ({ initLocale: async () => "en" }));
vi.mock("@/lib/auth/server", () => ({ auth: { api: {} } }));

const dir = mkdtempSync(join(tmpdir(), "parts-add-"));
const db = createDb(`file:${join(dir, "t.db").replaceAll("\\", "/")}`);
const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeAll(async () => {
  await runMigrations(db);
  await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com", status: "active" });
  await db.insert(merchants).values({
    id: "m1",
    name: "PCDiga",
    slug: "pcdiga",
    baseUrl: "https://www.pcdiga.com",
    searchTemplate: "https://www.pcdiga.com/search?q={q}",
  });
  await db.insert(merchants).values({
    id: "m2",
    name: "Amazon ES",
    slug: "amazon-es",
    baseUrl: "https://www.amazon.es",
    searchTemplate: "https://www.amazon.es/s?k={q}",
  });
});

afterAll(() => {
  fetchSpy.mockRestore();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may hold the handle briefly.
  }
});

beforeEach(async () => {
  await db.insert(builds).values({ id: "b1", userId: "u1", name: "Build" });
});

afterEach(async () => {
  await db.delete(builds);
  await db.delete(productMerchant);
  await db.delete(productIdentifiers);
  await db.delete(products);
});

const add = (over: Partial<Parameters<typeof addProductByUrl>[2]> = {}) =>
  addProductByUrl(db, "u1", {
    buildId: "b1",
    url: "https://www.pcdiga.com/processador-amd-ryzen-7-9800x3d-box",
    name: "AMD Ryzen 7 9800X3D",
    ...over,
  });

const items = () => db.select().from(buildItems).where(eq(buildItems.buildId, "b1"));

describe("addProductByUrl", () => {
  it("refuses unknown hosts and non-http links, and never fetches", async () => {
    await expect(add({ url: "https://evil.example/p/1" })).rejects.toMatchObject({
      code: "unknownMerchant",
    });
    await expect(add({ url: "https://pcdiga.com.evil.example/x" })).rejects.toMatchObject({
      code: "unknownMerchant",
    });
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://www.pcdiga.com/x",
      "nope",
    ]) {
      await expect(add({ url })).rejects.toMatchObject({ code: "badUrl" });
    }
    expect(await items()).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates a product, seeds the pair's auto URL (never a manual one) and adds it", async () => {
    const r = await add({ gtin: "5 056 000 000 001" });
    expect(r.created).toBe(true);
    const [p] = await db.select().from(products);
    expect(p).toMatchObject({ name: "AMD Ryzen 7 9800X3D", createdBy: "u1" });
    expect(p!.refUrl).toContain("pcdiga.com");
    const [pair] = await db.select().from(productMerchant);
    expect(pair).toMatchObject({ merchantId: "m1", manualUrl: null });
    expect(pair!.autoUrl).toContain("pcdiga.com/processador");
    expect(await items()).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stores a valid typed GTIN as an unconfirmed user identifier and skips an invalid one", async () => {
    await add({ gtin: "4006381333931" });
    await add({ url: "https://www.pcdiga.com/other", name: "Other Part", gtin: "123" });
    const ids = await db.select().from(productIdentifiers);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatchObject({
      kind: "gtin",
      value: "04006381333931",
      source: "user",
      confirmed: false,
    });
  });

  it("dedupes by link", async () => {
    const first = await add();
    const second = await add({
      url: "https://www.pcdiga.com/processador-amd-ryzen-7-9800x3d-box?utm_source=x#top",
      name: "Something else entirely",
    });
    expect(second).toMatchObject({ productId: first.productId, created: false, matchedBy: "url" });
    expect(await db.select().from(products)).toHaveLength(1);
    expect((await items())[0]!.quantity).toBe(2);
  });

  it("dedupes by ASIN", async () => {
    const first = await add({
      url: "https://www.amazon.es/dp/B0DVZSG8D5",
      name: "Ryzen 9800X3D Amazon title",
    });
    const second = await add({
      url: "https://www.amazon.es/Some-Slug/dp/B0DVZSG8D5/ref=sr_1_1?keywords=x",
      name: "Totally different words",
    });
    expect(second.productId).toBe(first.productId);
    expect(second.created).toBe(false);
  });

  it("dedupes by an identifier already known for the product", async () => {
    const first = await add({ gtin: "4006381333931" });
    const second = await add({
      url: "https://www.pcdiga.com/another-listing",
      name: "Unrelated name",
      gtin: "4006381333931",
    });
    expect(second).toMatchObject({ productId: first.productId, matchedBy: "identifier" });
  });

  it("dedupes by catalog name and ignores archived products", async () => {
    await db
      .insert(products)
      .values({ id: "old", name: "AMD Ryzen 7 9800X3D", query: "x", archived: true });
    await db.insert(products).values({ id: "p1", name: "amd ryzen 7 9800x3d (box)", query: "x" });
    const r = await add();
    expect(r).toMatchObject({ productId: "p1", created: false, matchedBy: "name" });
    const [pair] = await db.select().from(productMerchant);
    expect(pair!.autoUrl).toContain("pcdiga.com");
  });

  it("never overwrites an existing URL on the pair", async () => {
    await db.insert(products).values({ id: "p1", name: "AMD Ryzen 7 9800X3D", query: "x" });
    await db.insert(productMerchant).values({
      productId: "p1",
      merchantId: "m1",
      manualUrl: "https://www.pcdiga.com/pinned",
      autoUrl: "https://www.pcdiga.com/learned",
    });
    await add({ url: "https://www.pcdiga.com/a-new-link" });
    const [pair] = await db.select().from(productMerchant);
    expect(pair).toMatchObject({
      manualUrl: "https://www.pcdiga.com/pinned",
      autoUrl: "https://www.pcdiga.com/learned",
    });
  });

  it("fills a pair that exists without any URL", async () => {
    await db.insert(products).values({ id: "p1", name: "AMD Ryzen 7 9800X3D", query: "x" });
    await db.insert(productMerchant).values({ productId: "p1", merchantId: "m1" });
    await add();
    const [pair] = await db.select().from(productMerchant);
    expect(pair!.autoUrl).toContain("pcdiga.com/processador");
    expect(pair!.manualUrl).toBeNull();
  });
});

describe("addToBuild", () => {
  it("appends with the next sort order and bumps quantity on repeat", async () => {
    await db.insert(products).values([
      { id: "p1", name: "A", query: "a" },
      { id: "p2", name: "B", query: "b" },
    ]);
    await addToBuild(db, "b1", "p1");
    await addToBuild(db, "b1", "p2");
    await addToBuild(db, "b1", "p1");
    const rows = await db.select().from(buildItems).where(eq(buildItems.buildId, "b1"));
    const byId = Object.fromEntries(rows.map((r) => [r.productId, r]));
    expect(byId.p1).toMatchObject({ quantity: 2, sortOrder: 0 });
    expect(byId.p2).toMatchObject({ quantity: 1, sortOrder: 1 });
  });
});

describe("importPcppList", () => {
  const text = [
    "CPU: AMD Ryzen 7 9800X3D €449,00",
    "Memory: G.Skill Trident Z5 32GB DDR5-6000 €120,00",
  ].join("\n");

  it("rejects text without parts", async () => {
    await expect(
      importPcppList(db, "u1", { buildId: "b1", text: "hello", replace: false }),
    ).rejects.toMatchObject({
      code: "importEmpty",
    });
  });

  it("creates new products and matches existing ones by catalog key", async () => {
    await db.insert(products).values({ id: "p1", name: "AMD Ryzen 7 9800X3D", query: "x" });
    const r = await importPcppList(db, "u1", { buildId: "b1", text, replace: false });
    expect(r).toEqual({ added: 1, matched: 1 });
    expect(await items()).toHaveLength(2);
    const created = (await db.select().from(products)).find((p) => p.id !== "p1")!;
    expect(created).toMatchObject({ createdBy: "u1", refPrice: 120 });
  });

  it("replace keeps bought items only", async () => {
    await db.insert(products).values([
      { id: "p1", name: "Case X", query: "x" },
      { id: "p2", name: "PSU Y", query: "y" },
    ]);
    await addToBuild(db, "b1", "p1");
    await addToBuild(db, "b1", "p2");
    await db
      .update(buildItems)
      .set({ boughtAt: new Date() })
      .where(and(eq(buildItems.buildId, "b1"), eq(buildItems.productId, "p1")));
    await importPcppList(db, "u1", { buildId: "b1", text, replace: true });
    const ids = (await items()).map((i) => i.productId);
    expect(ids).toContain("p1");
    expect(ids).not.toContain("p2");
    expect(ids).toHaveLength(3);
  });
});
