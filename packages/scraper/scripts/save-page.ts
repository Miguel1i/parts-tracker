/**
 * Saves a page as rendered by the scraper's browser (for fixtures of shops that block plain
 * fetches). Trim it afterwards with `pnpm --filter @parts/core fixture:capture --file`.
 *
 *   pnpm --filter @parts/scraper save-page <url> <out.html> [--headed]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBrowserSession } from "../src/browser";
import { blockReason } from "../src/http";

const [url, out] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!url || !out) throw new Error("usage: save-page <url> <out.html> [--headed]");
const session = createBrowserSession({ headless: !process.argv.includes("--headed") });
try {
  const r = await session.transport(url);
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), out);
  writeFileSync(path, r.html);
  const blocked = blockReason(r.status, r.html);
  console.log(
    `${r.status} ${r.finalUrl} → ${path} (${r.html.length} chars)${blocked ? ` BLOCKED: ${blocked}` : ""}`,
  );
} finally {
  await session.close();
}
