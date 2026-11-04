/** ECB reference rates (units per 1 EUR), cached in `fx_rates` for 6 hours. */
import type { FxRates } from "@parts/core";
import { fxRates, type Db } from "@parts/db";
import { sql } from "drizzle-orm";
import { BROWSER_HEADERS } from "./http";

export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const FX_MAX_AGE_MS = 6 * 3_600_000;

export function parseEcbXml(xml: string): FxRates {
  const rates: FxRates = {};
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const rate = Number(m[2]);
    if (rate > 0) rates[m[1]!] = rate;
  }
  return rates;
}

export type TextFetch = (url: string) => Promise<string>;

const defaultFetch: TextFetch = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_HEADERS["User-Agent"]! },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ECB HTTP ${res.status}`);
  return res.text();
};

/**
 * Returns stored rates when fresh, else downloads the ECB file and upserts it. A failed
 * download falls back to whatever is stored (stale rates beat no rates).
 */
export async function loadRates(
  db: Db,
  options: { now?: Date; fetchText?: TextFetch; log?: (line: string) => void } = {},
): Promise<FxRates> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});
  const stored = await db.select().from(fxRates);
  const toMap = (rows: typeof stored) =>
    Object.fromEntries(rows.map((r) => [r.currency, r.rate])) as FxRates;
  const newest = Math.max(0, ...stored.map((r) => r.fetchedAt.getTime()));
  if (stored.length && now.getTime() - newest < FX_MAX_AGE_MS) {
    return { ...toMap(stored), EUR: 1 };
  }
  try {
    const rates = parseEcbXml(await (options.fetchText ?? defaultFetch)(ECB_DAILY_URL));
    const rows = Object.entries(rates).map(([currency, rate]) => ({
      currency,
      rate,
      fetchedAt: now,
    }));
    if (!rows.length) throw new Error("ECB file had no rates");
    await db
      .insert(fxRates)
      .values(rows)
      .onConflictDoUpdate({
        target: fxRates.currency,
        set: { rate: sql`excluded.rate`, fetchedAt: sql`excluded.fetched_at` },
      });
    log(`fx: ${rows.length} ECB rates (GBP ${rates.GBP ?? "?"})`);
    return { ...rates, EUR: 1 };
  } catch (err) {
    log(
      `fx: ECB download failed (${err instanceof Error ? err.message : err}); using stored rates`,
    );
    return { ...toMap(stored), EUR: 1 };
  }
}
