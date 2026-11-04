import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { firstAdminId, LEGACY_ADMIN_USER_ID, promoteAdmin } from "../src/admin";
import { createDb, type Db } from "../src/client";
import { importLegacy } from "../src/import";
import type { LegacyFile } from "../src/legacy";
import { MIGRATIONS_FOLDER, runMigrations } from "../src/migrate";
import { account, auditLog, builds, products, user, userMerchants } from "../src/schema";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/pc_tracker.fixture.json", import.meta.url), "utf8"),
) as LegacyFile;

const dir = mkdtempSync(join(tmpdir(), "parts-admin-"));
let db: Db;
let n = 0;
const fresh = () => createDb(`file:${join(dir, `t-${n++}.db`).replaceAll("\\", "/")}`);

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may hold the handle briefly.
  }
});

async function fkViolations(d: Db) {
  return (await d.$client.execute("PRAGMA foreign_key_check")).rows;
}

describe("migration 0002_auth on a database with legacy data", () => {
  it("adds a placeholder owner so every legacy row satisfies the new foreign keys", async () => {
    // A copy of the migrations folder that stops at 0001, as on Turso before this milestone.
    const old = join(dir, "migrations-0001");
    mkdirSync(old, { recursive: true });
    cpSync(MIGRATIONS_FOLDER, old, { recursive: true });
    const journalPath = join(old, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 1);
    writeFileSync(journalPath, JSON.stringify(journal));

    const d = fresh();
    await migrate(d, { migrationsFolder: old });
    await d.$client.executeMultiple(`
      INSERT INTO merchants (id, name, slug, base_url, search_template) VALUES ('m1','Shop','shop','https://s','https://s?q={q}');
      INSERT INTO products (id, name, query, created_by) VALUES ('p1','CPU','cpu','legacy-admin');
      INSERT INTO builds (id, user_id, name) VALUES ('b1','legacy-admin','Legacy build');
      INSERT INTO user_merchants (user_id, merchant_id) VALUES ('legacy-admin','m1');
    `);

    await runMigrations(d);
    const [placeholder] = await d.select().from(user).where(eq(user.id, LEGACY_ADMIN_USER_ID));
    expect(placeholder).toMatchObject({ banned: true, role: "user" });
    expect(await fkViolations(d)).toEqual([]);
    expect(await d.$count(builds)).toBe(1);
    // The rewritten columns enforce the new foreign keys.
    await expect(d.insert(builds).values({ userId: "nobody", name: "x" })).rejects.toThrow();
    d.$client.close();
  });

  it("adds no placeholder to an empty database", async () => {
    const d = fresh();
    await runMigrations(d);
    expect(await d.$count(user)).toBe(0);
    d.$client.close();
  });
});

describe("promoteAdmin", () => {
  beforeEach(async () => {
    db = fresh();
    await runMigrations(db);
  });
  afterEach(() => db.$client.close());

  it("creates the admin and moves legacy data to them", async () => {
    await importLegacy(db, fixture);
    expect(await firstAdminId(db)).toBeUndefined();

    const res = await promoteAdmin(db, "  Owner@Example.com ");
    expect(res.created).toBe(true);
    expect(res.reassigned).toBeGreaterThan(0);

    const [admin] = await db.select().from(user).where(eq(user.id, res.userId));
    expect(admin).toMatchObject({
      email: "owner@example.com",
      role: "admin",
      status: "active",
      emailVerified: true,
    });
    expect(await firstAdminId(db)).toBe(res.userId);
    expect(await db.$count(user, eq(user.id, LEGACY_ADMIN_USER_ID))).toBe(0);
    expect(await db.$count(builds, eq(builds.userId, res.userId))).toBe(1);
    expect(await db.$count(products, eq(products.createdBy, res.userId))).toBe(2);
    expect(await db.$count(userMerchants, eq(userMerchants.userId, LEGACY_ADMIN_USER_ID))).toBe(0);
    expect(await db.$count(userMerchants, eq(userMerchants.userId, res.userId))).toBe(4);
    expect(await db.$count(auditLog, eq(auditLog.action, "user.create"))).toBe(1);
    expect(await fkViolations(db)).toEqual([]);
  });

  it("promotes an existing user and keeps their own merchant choices on collision", async () => {
    await importLegacy(db, fixture);
    const [existing] = await db
      .insert(user)
      .values({ name: "Pat", email: "pat@example.com", status: "pending" })
      .returning();
    const [m] = await db.select({ merchantId: userMerchants.merchantId }).from(userMerchants);
    await db
      .insert(userMerchants)
      .values({ userId: existing!.id, merchantId: m!.merchantId, enabled: false });

    const res = await promoteAdmin(db, "pat@example.com");
    expect(res).toMatchObject({ userId: existing!.id, created: false });
    const [row] = await db
      .select()
      .from(userMerchants)
      .where(eq(userMerchants.merchantId, m!.merchantId));
    expect(row).toMatchObject({ userId: existing!.id, enabled: false });
    expect(await db.$count(userMerchants)).toBe(4);
    expect(await fkViolations(db)).toEqual([]);
  });

  it("sets the username and the password login, and updates the password on re-run", async () => {
    const res = await promoteAdmin(db, "me@example.com", {
      username: "Miguel",
      passwordHash: "h1",
    });
    const [u] = await db.select().from(user).where(eq(user.id, res.userId));
    expect(u).toMatchObject({ username: "miguel", displayUsername: "Miguel", name: "Miguel" });
    await promoteAdmin(db, "me@example.com", { passwordHash: "h2" });
    const creds = await db.select().from(account).where(eq(account.userId, res.userId));
    expect(creds).toEqual([expect.objectContaining({ providerId: "credential", password: "h2" })]);
  });

  it("refuses a username that belongs to someone else or breaks the rules", async () => {
    await promoteAdmin(db, "a@example.com", { username: "taken" });
    await expect(promoteAdmin(db, "b@example.com", { username: "Taken" })).rejects.toThrow(/taken/);
    await expect(promoteAdmin(db, "b@example.com", { username: "no spaces" })).rejects.toThrow();
  });

  it("is safe to re-run and rejects bad input", async () => {
    await promoteAdmin(db, "a@example.com");
    const again = await promoteAdmin(db, "a@example.com");
    expect(again.created).toBe(false);
    await expect(promoteAdmin(db, "nope")).rejects.toThrow();
    await expect(promoteAdmin(db, "legacy-admin@invalid.local")).rejects.toThrow();
  });
});
