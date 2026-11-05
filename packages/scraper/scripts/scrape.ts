/**
 * Scrape CLI (GitHub Actions and local runs).
 *
 *   pnpm scrape                                  # every enabled pair (cron)
 *   pnpm scrape --product <id|name> --merchant <id|slug|name>
 *   pnpm scrape --build <id>                     # every product in one build
 *   pnpm scrape --run-id <id> --trigger manual   # a run queued by the web app (its stored scope)
 *   pnpm scrape --no-browser                     # plain fetch only
 *
 * Writes to TURSO_DATABASE_URL (default: local.db at the repo root). Raw HTML of failed fetches
 * goes to --debug-dir (default debug/, uploaded as an Actions artifact), never to the DB.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createDb, resolveDatabaseUrl, scrapeRuns } from "@parts/db";
import { eq } from "@parts/db/orm";
import { createBrowserSession } from "../src/browser";
import { loadRates } from "../src/fx";
import { plainTransport, SmartFetcher } from "../src/http";
import { runScrape } from "../src/run";
import { findMerchant, findProduct, type RunScope } from "../src/store";
import { loadEnv } from "./env";

const { values: args } = parseArgs({
  options: {
    product: { type: "string" },
    merchant: { type: "string" },
    build: { type: "string" },
    "run-id": { type: "string" },
    trigger: { type: "string", default: "manual" },
    "gh-run-url": { type: "string" },
    "no-browser": { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
    "debug-dir": { type: "string", default: "debug" },
    concurrency: { type: "string", default: "4" },
  },
});
const opt = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

loadEnv();
const db = createDb();
console.log(`db: ${resolveDatabaseUrl().replace(/\?.*$/, "")}`);

const runId = opt(args["run-id"]);
const productKey = opt(args.product);
const buildKey = opt(args.build);
const merchantKey = opt(args.merchant);
const product = productKey ? await findProduct(db, productKey) : null;
const merchant = merchantKey ? await findMerchant(db, merchantKey) : null;
if (productKey && !product) throw new Error(`no product ${productKey}`);
if (merchantKey && !merchant) throw new Error(`no merchant ${merchantKey}`);

// A run queued by the web app carries its scope in the row; explicit flags override it.
let scope: RunScope = {
  ...(product ? { productId: product.id } : {}),
  ...(merchant ? { merchantId: merchant.id } : {}),
  ...(buildKey ? { buildId: buildKey } : {}),
};
if (runId && !Object.keys(scope).length) {
  const [row] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, runId));
  if (row) {
    const { productId, merchantId, buildId } = row.scope;
    scope = {
      ...(productId ? { productId } : {}),
      ...(merchantId ? { merchantId } : {}),
      ...(buildId ? { buildId } : {}),
    };
  }
}

const trigger = args.trigger === "cron" ? "cron" : "manual";
const browser = args["no-browser"] ? null : createBrowserSession({ headless: !args.headed });
const fetcher = new SmartFetcher({ plain: plainTransport(), browser: browser?.transport ?? null });
const debugDir = resolve(process.env.INIT_CWD ?? process.cwd(), args["debug-dir"]!);
let saved = 0;

try {
  const rates = await loadRates(db, { log: console.log });
  const result = await runScrape({
    db,
    fetcher,
    rates,
    trigger,
    runId,
    ghRunUrl: opt(args["gh-run-url"]),
    scope,
    merchantConcurrency: Number(args.concurrency) || 4,
    log: console.log,
    onFailurePage: (pair, page) => {
      const dir = join(debugDir, pair.merchant.slug);
      mkdirSync(dir, { recursive: true });
      const name = `${pair.product.id.slice(0, 8)}-${++saved}-${page.status || "err"}.html`;
      writeFileSync(join(dir, name), `<!-- ${page.url}\n${page.reason} -->\n${page.html}`);
    },
  });
  console.log(`\nrun ${result.runId} done:`, JSON.stringify(result.stats));
  if (saved) console.log(`${saved} failed pages saved to ${debugDir}`);
} finally {
  await browser?.close();
  db.$client.close();
}
