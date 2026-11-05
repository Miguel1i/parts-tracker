/**
 * User B calls every build action on user A's build through the real Server Actions and a real
 * DB: each must answer `notFound` and change nothing.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildItems, builds, createDb, merchants, products, user } from "@parts/db";
import { runMigrations } from "@parts/db/migrate";
import { eq } from "@parts/db/orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  session: null as null | { user: Record<string, unknown>; session: Record<string, unknown> },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/root-params", () => ({ locale: async () => "en" }));
vi.mock("@/i18n/server", () => ({ initLocale: async () => "en" }));
vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@/lib/admin/github", () => ({
  dispatchScrape: vi.fn(async () => ({ dispatched: true })),
}));
vi.mock("@parts/db", async (orig) => ({
  ...(await orig<typeof import("@parts/db")>()),
  getDb: () => h.db,
}));

const listActions = await import("@/app/[locale]/builds/actions");
const itemActions = await import("@/app/[locale]/builds/[id]/actions");

const dir = mkdtempSync(join(tmpdir(), "parts-own-"));
const db = createDb(`file:${join(dir, "t.db").replaceAll("\\", "/")}`);
h.db = db;

const asUser = (id: string) => ({
  user: { id, name: id, email: `${id}@example.com`, role: "user", status: "active", banned: false },
  session: { id: `s-${id}` },
});

beforeAll(async () => {
  await runMigrations(db);
  await db.insert(user).values([
    { id: "alice", name: "Alice", email: "alice@example.com", status: "active" },
    { id: "bob", name: "Bob", email: "bob@example.com", status: "active" },
  ]);
  await db.insert(merchants).values({
    id: "m1",
    name: "Shop",
    slug: "shop",
    baseUrl: "https://shop.example",
    searchTemplate: "https://shop.example/s?q={q}",
  });
  await db.insert(products).values({ id: "p1", name: "AMD Ryzen 7 9800X3D", query: "9800X3D" });
  await db.insert(builds).values({ id: "b-alice", userId: "alice", name: "Alice's build" });
  await db.insert(buildItems).values({ buildId: "b-alice", productId: "p1", quantity: 1 });
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may hold the file briefly.
  }
});

const buildId = "b-alice";
const attempts: [string, () => Promise<unknown>][] = [
  ["renameBuild", () => listActions.renameBuild({ buildId, name: "pwned" })],
  ["deleteBuild", () => listActions.deleteBuild({ buildId })],
  ["setQuantity", () => itemActions.setQuantity({ buildId, productId: "p1", quantity: 9 })],
  ["removeItem", () => itemActions.removeItem({ buildId, productId: "p1" })],
  ["moveItem", () => itemActions.moveItem({ buildId, productId: "p1", direction: "down" })],
  [
    "setBought",
    () =>
      itemActions.setBought({
        buildId,
        productId: "p1",
        price: 1,
        merchantId: "m1",
        date: "2026-11-01",
      }),
  ],
  ["clearBought", () => itemActions.clearBought({ buildId, productId: "p1" })],
  ["addCatalogProduct", () => itemActions.addCatalogProduct({ buildId, productId: "p1" })],
  [
    "addByUrl",
    () => itemActions.addByUrl({ buildId, url: "https://shop.example/p/x", name: "Some part" }),
  ],
  [
    "importPcpp",
    () => itemActions.importPcpp({ buildId, text: "CPU: AMD Ryzen 5", replace: true }),
  ],
  ["checkNow", () => itemActions.checkNow({ buildId })],
  [
    "reportWrongMatch",
    () => itemActions.reportWrongMatch({ buildId, productId: "p1", merchantId: "m1" }),
  ],
  ["setBuildPublic", () => itemActions.setBuildPublic({ buildId, isPublic: true })],
  ["resetShareLink", () => itemActions.resetShareLink({ buildId })],
];

describe("another user's build", () => {
  it.each(attempts)("%s → notFound and nothing changes", async (_name, call) => {
    h.session = asUser("bob");
    const result = (await call()) as { ok: boolean; error?: string };
    // Inputs that don't parse are refused even earlier; either way nothing may happen.
    expect(result.ok).toBe(false);
    expect(result.error).toBe("notFound");
    const [b] = await db.select().from(builds).where(eq(builds.id, buildId));
    expect(b).toMatchObject({ name: "Alice's build", isPublic: false, shareToken: null });
    const items = await db.select().from(buildItems).where(eq(buildItems.buildId, buildId));
    expect(items).toEqual([
      expect.objectContaining({ productId: "p1", quantity: 1, boughtAt: null }),
    ]);
  });

  it("the owner can still change it", async () => {
    h.session = asUser("alice");
    const r = (await listActions.renameBuild({ buildId, name: "Renamed" })) as { ok: boolean };
    expect(r.ok).toBe(true);
  });
});
