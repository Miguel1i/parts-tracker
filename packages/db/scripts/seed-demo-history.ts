/**
 * Fills a LOCAL database with 120 days of plausible price history for every product × merchant
 * pair that has a price, so charts can be developed and checked. Demo data only:
 *
 *   pnpm --filter @parts/db db:seed-demo
 *
 * Refuses any non-`file:` database (never Turso). Rows are tagged with a `demo` run so
 * `--clear` can remove them again.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { createDb, resolveDatabaseUrl } from "../src/client";
import { runMigrations } from "../src/migrate";
import { merchants, pricePoints, productMerchant, scrapeRuns } from "../src/schema";
import { loadEnv } from "./env";

loadEnv();
const url = resolveDatabaseUrl();
if (!url.startsWith("file:")) {
  console.error(
    `Refusing to seed demo history into ${url.replace(/\?.*$/, "")}: local file DBs only.`,
  );
  process.exit(1);
}

const DEMO_RUN = "demo-history";
const DAYS = 120;
const db = createDb();
await runMigrations(db);

await db.delete(pricePoints).where(eq(pricePoints.runId, DEMO_RUN));
await db.delete(scrapeRuns).where(eq(scrapeRuns.id, DEMO_RUN));
if (process.argv.includes("--clear")) {
  console.log("Removed demo history.");
  db.$client.close();
  process.exit(0);
}

await db.insert(scrapeRuns).values({
  id: DEMO_RUN,
  trigger: "cron",
  status: "succeeded",
  scope: {},
  startedAt: new Date(Date.now() - DAYS * 86_400_000),
  finishedAt: new Date(),
});

// Deterministic pseudo-random walk, so re-seeding gives the same charts.
let seed = 42;
const rand = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;

const pairs = await db
  .select({
    productId: productMerchant.productId,
    merchantId: productMerchant.merchantId,
    price: productMerchant.lastPriceEur,
    shipping: merchants.shipping,
  })
  .from(productMerchant)
  .innerJoin(merchants, eq(merchants.id, productMerchant.merchantId))
  .where(and(isNotNull(productMerchant.lastPriceEur), inArray(productMerchant.lastStatus, ["ok"])));

const now = Date.now();
const rows: (typeof pricePoints.$inferInsert)[] = [];
for (const pair of pairs) {
  const target = pair.price!;
  let price = target * (1.08 + rand() * 0.12);
  let inStock = true;
  for (let day = DAYS; day >= 1; day--) {
    // Four checks a day; a price moves on roughly one check in five.
    for (const hour of [1, 7, 13, 19]) {
      const ts = now - day * 86_400_000 + hour * 3_600_000;
      if (rand() < 0.2) price = Math.max(target * 0.85, price * (0.97 + rand() * 0.05));
      if (rand() < 0.01) inStock = !inStock;
      // Drift towards today's real price over the period.
      price += (target - price) * 0.01;
      rows.push({
        productId: pair.productId,
        merchantId: pair.merchantId,
        ts: new Date(ts),
        priceEur: Math.round(price * 100) / 100,
        currency: "EUR",
        shipping: pair.shipping,
        inStock,
        runId: DEMO_RUN,
      });
    }
  }
}
for (let i = 0; i < rows.length; i += 500)
  await db.insert(pricePoints).values(rows.slice(i, i + 500));
console.log(`Seeded ${rows.length} demo price points for ${pairs.length} pairs into ${url}.`);
db.$client.close();
