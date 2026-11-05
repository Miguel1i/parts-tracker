import { getDb } from "@parts/db";
import { evaluateAccess } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/guard";
import { priceWithShipping } from "@/lib/builds/queries";
import {
  HISTORY_RANGES,
  loadProductHistory,
  rangeStart,
  type HistoryRange,
} from "@/lib/charts/history";
import {
  GAP_MS,
  STALE_MS,
  downsample,
  lowestBand,
  seriesStats,
  stepSeries,
  type SeriesPoint,
  type SeriesStats,
} from "@/lib/charts/transforms";

const MAX_POINTS = 500;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (evaluateAccess(session?.user, "user") !== "ok") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session!.user.id;
  const { id } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const rangeParam = params.get("range") ?? "30d";
  const range: HistoryRange = (HISTORY_RANGES as readonly string[]).includes(rangeParam)
    ? (rangeParam as HistoryRange)
    : "30d";
  const db = getDb();
  const shippingParam = params.get("shipping");
  const withShipping =
    shippingParam === "0"
      ? false
      : shippingParam === "1"
        ? true
        : await priceWithShipping(db, userId);

  const history = await loadProductHistory(db, {
    productId: id,
    userId,
    from: rangeStart(range, Date.now()),
    withShipping,
  });
  if (!history) return Response.json({ error: "not_found" }, { status: 404 });

  const full = stepSeries(history.obs, { withShipping, gapMs: GAP_MS });
  const series: Record<string, SeriesPoint[]> = {};
  const stats: Record<string, SeriesStats> = {};
  for (const m of history.merchants) {
    const points = full.get(m.id) ?? [];
    series[m.id] = downsample(points, MAX_POINTS);
    stats[m.id] = seriesStats(points.filter((p) => p.inStock));
  }
  const band = downsample(
    lowestBand(history.obs, { withShipping, staleMs: STALE_MS }).map((b) => ({
      ...b,
      value: b.min,
    })),
    MAX_POINTS,
  ).map(({ ts, min, merchantId }) => ({ ts, min, merchantId }));

  return Response.json(
    {
      product: history.product,
      merchants: history.merchants,
      range,
      withShipping,
      series,
      band,
      stats,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
