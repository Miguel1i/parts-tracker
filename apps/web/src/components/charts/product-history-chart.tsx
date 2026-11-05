"use client";

import { Download, ImageDown, Table2, LineChart as LineChartIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import {
  DAY_MS,
  summarize,
  type SeriesPoint,
  type SeriesStats,
  type SummaryText,
} from "@/lib/charts/transforms";
import {
  OOS_SUFFIX,
  VIEW_RANGES,
  buildCsv,
  mergeSeries,
  pointAt,
  safeHttpUrl,
  serializeViewState,
  type ViewRange,
  type ViewState,
} from "@/lib/charts/product-view";
import { cn } from "@/lib/utils";
import { downloadText, exportSvgPng, fileStem } from "./product-export";

type MerchantInfo = { id: string; name: string; color: string; dash?: string };
type HistoryData = {
  product: { id: string; name: string; refPrice: number | null };
  merchants: MerchantInfo[];
  range: ViewRange;
  withShipping: boolean;
  series: Record<string, SeriesPoint[]>;
  band: { ts: number; min: number | null; merchantId: string | null }[];
  stats: Record<string, SeriesStats>;
};

export type ProductHistoryChartProps = {
  productId: string;
  productName: string;
  refPrice: number | null;
  initial: ViewState;
  defaultShipping: boolean;
  bought: { at: number; price: number | null; merchantName: string | null } | null;
  isAdmin: boolean;
};

const RANGE_DAYS: Record<ViewRange, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365, all: 0 };

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function Key({ color, dash, faded }: { color: string; dash?: string; faded?: boolean }) {
  return (
    <svg width="18" height="8" aria-hidden className="shrink-0">
      <line
        x1="0"
        y1="4"
        x2="18"
        y2="4"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dash}
        strokeOpacity={faded ? 0.55 : 1}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProductHistoryChart(props: ProductHistoryChartProps) {
  const { productId, productName, refPrice, initial, defaultShipping, bought, isAdmin } = props;
  const t = useTranslations("Product.history");
  const format = useFormatter();
  const desktop = useIsDesktop();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [range, setRange] = useState<ViewRange>(initial.range);
  const [shipping, setShipping] = useState<boolean>(initial.shipping ?? defaultShipping);
  const [hidden, setHidden] = useState<string[]>(initial.hidden);
  const [data, setData] = useState<HistoryData | null>(null);
  const [done, setDone] = useState<{ key: string; failed: boolean } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const [brush, setBrush] = useState<{ start: number; end: number } | null>(null);
  const [pop, setPop] = useState<{ x: number; y: number; ts: number } | null>(null);

  // Fetch on range / shipping change; the previous render stays (dimmed) meanwhile.
  const key = `${range}:${shipping ? 1 : 0}`;
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/products/${productId}/history?range=${range}&shipping=${shipping ? 1 : 0}`, {
      signal: ac.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<HistoryData>;
      })
      .then((d) => {
        setData(d);
        setDone({ key, failed: false });
        setBrush(null);
        setPop(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setDone({ key, failed: true });
      });
    return () => ac.abort();
  }, [productId, range, shipping, key]);
  const loading = done?.key !== key;
  const failed = done?.key === key && done.failed;

  // The URL reproduces the view.
  useEffect(() => {
    try {
      const qs = serializeViewState({
        range,
        hidden,
        shipping: shipping === defaultShipping ? null : shipping,
      });
      const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* sandboxed or unsupported: the view just isn't linkable */
    }
  }, [range, hidden, shipping, defaultShipping]);

  const withData = useMemo(
    () =>
      data ? data.merchants.filter((m) => data.series[m.id]?.some((p) => p.value != null)) : [],
    [data],
  );
  const visible = useMemo(() => withData.filter((m) => !hidden.includes(m.id)), [withData, hidden]);

  const rows = useMemo(() => {
    if (!data) return [];
    const series: Record<string, SeriesPoint[]> = {};
    for (const m of visible) series[m.id] = data.series[m.id] ?? [];
    return mergeSeries(series, data.band);
  }, [data, visible]);

  const start = brush ? Math.min(brush.start, rows.length - 1) : 0;
  const end = brush ? Math.min(brush.end, rows.length - 1) : rows.length - 1;
  const winFrom = rows[start]?.ts;
  const winTo = rows[end]?.ts;

  const yDomain = useMemo((): [number, number] => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = start; i <= end; i++) {
      const r = rows[i];
      if (!r) continue;
      for (const [k, v] of Object.entries(r)) {
        if (k === "ts" || v == null) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (refPrice != null) {
      lo = Math.min(lo, refPrice);
      hi = Math.max(hi, refPrice);
    }
    if (!isFinite(lo)) return [0, 100];
    const pad = Math.max((hi - lo) * 0.1, hi * 0.02, 1);
    return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
  }, [rows, start, end, refPrice]);

  const price0 = (n: number) =>
    format.number(n, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const priceFmt = (n: number) => format.number(n, "price");
  const dateShort = (ts: number) =>
    format.dateTime(ts, { day: "numeric", month: "short", timeZone: "Europe/Lisbon" });
  const dateTime = (ts: number) =>
    format.dateTime(ts, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" });
  const spanMs = winFrom != null && winTo != null ? winTo - winFrom : 0;
  const tick = (ts: number) =>
    spanMs <= 2 * DAY_MS
      ? format.dateTime(ts, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })
      : dateShort(ts);

  function toggle(id: string) {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return withData.length > 0 && next.length >= withData.length ? [] : next;
    });
  }
  function isolate(id: string) {
    setHidden((prev) => {
      const others = withData.filter((m) => m.id !== id).map((m) => m.id);
      const isolated = others.length === prev.length && others.every((o) => prev.includes(o));
      return isolated ? [] : others;
    });
  }

  const dim = (id: string) => (highlight && highlight !== id ? 0.2 : 1);

  // Accessible summary.
  const summaryText: SummaryText = {
    lowest: (price, merchant) => t("summary.lowest", { price, merchant }),
    down: (pct, days) => t("summary.down", { pct, days }),
    up: (pct, days) => t("summary.up", { pct, days }),
    flat: (days) => t("summary.flat", { days }),
    none: () => t("summary.none"),
  };
  const summary = useMemo(() => {
    if (!data) return t("summary.none");
    let lowest: { price: number; merchantName: string } | null = null;
    for (const m of visible) {
      const last = data.series[m.id]?.at(-1);
      if (last && last.value != null && last.inStock && (!lowest || last.value < lowest.price)) {
        lowest = { price: last.value, merchantName: m.name };
      }
    }
    const band = data.band.filter((b) => b.min != null);
    const a = band[0];
    const b = band.at(-1);
    const changePct = a && b && a !== b && a.min! > 0 ? ((b.min! - a.min!) / a.min!) * 100 : null;
    const days =
      RANGE_DAYS[data.range] || (a && b ? Math.max(1, Math.round((b.ts - a.ts) / DAY_MS)) : 1);
    return summarize({ lowest, changePct, days, formatPrice: priceFmt }, summaryText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, visible]);

  const csvMerchants = visible.map((m) => ({ id: m.id, name: m.name }));
  const tableRows = useMemo(() => {
    if (!data) return [];
    const out: { ts: number; name: string; p: SeriesPoint }[] = [];
    for (const m of visible) {
      for (const p of data.series[m.id] ?? []) {
        if (!p.obs) continue;
        if (winFrom != null && p.ts < winFrom) continue;
        if (winTo != null && p.ts > winTo) continue;
        out.push({ ts: p.ts, name: m.name, p });
      }
    }
    return out.sort((a, b) => b.ts - a.ts || a.name.localeCompare(b.name)).slice(0, 400);
  }, [data, visible, winFrom, winTo]);

  function exportCsv() {
    if (!data) return;
    downloadText(
      buildCsv(data.series, csvMerchants, { from: winFrom, to: winTo }),
      `${fileStem(productName)}-${range}.csv`,
    );
  }
  const exportPng = useCallback(async () => {
    const svg = wrapRef.current?.querySelector<SVGSVGElement>("svg.recharts-surface");
    if (!svg) return;
    try {
      await exportSvgPng(svg, `${fileStem(productName)}-${range}.png`, productName);
    } catch {
      /* the button simply does nothing if the browser can't render it */
    }
  }, [productName, range]);

  const lows = visible.flatMap((m) => {
    const s = data?.stats[m.id]?.min;
    return s ? [{ m, ...s }] : [];
  });
  const currents = visible.flatMap((m) => {
    const last = data?.series[m.id]?.at(-1);
    return last && last.value != null ? [{ m, ts: last.ts, value: last.value }] : [];
  });

  function renderTooltip(p: { active?: boolean; label?: unknown; payload?: readonly unknown[] }) {
    if (!p.active || !data) return null;
    const ts = Number(p.label);
    if (!isFinite(ts)) return null;
    const list = visible
      .map((m) => ({ m, pt: pointAt(data.series[m.id] ?? [], ts) }))
      .filter(
        (x): x is { m: MerchantInfo; pt: SeriesPoint & { value: number } } => x.pt?.value != null,
      )
      .sort((a, b) => a.pt.value - b.pt.value || a.m.name.localeCompare(b.m.name));
    return (
      <div className="bg-popover text-popover-foreground grid min-w-52 max-w-[min(20rem,86vw)] gap-1.5 rounded-lg border px-3 py-2 text-xs shadow-md">
        <div className="font-medium">{dateTime(ts)}</div>
        {list.length === 0 && <div className="text-muted-foreground">{t("noOffers")}</div>}
        {list.map(({ m, pt }) => (
          <div key={m.id} className="flex items-start gap-2">
            <span className="mt-1.5">
              <Key color={m.color} dash={m.dash} faded={!pt.inStock} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold tabular-nums">{priceFmt(pt.value)}</span>
                <span className="text-muted-foreground break-words">{m.name}</span>
              </div>
              {pt.obs && (
                <div className="text-muted-foreground tabular-nums">
                  {t("tooltip.detail", {
                    price: priceFmt(pt.obs.price),
                    shipping: priceFmt(pt.obs.shipping),
                    stock: pt.inStock ? t("inStock") : t("outOfStock"),
                    time: dateTime(pt.obs.ts),
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const popList = useMemo(() => {
    if (!pop || !data) return [];
    return visible
      .map((m) => ({ m, pt: pointAt(data.series[m.id] ?? [], pop.ts) }))
      .filter(
        (x): x is { m: MerchantInfo; pt: SeriesPoint & { obs: NonNullable<SeriesPoint["obs"]> } } =>
          Boolean(x.pt?.obs),
      )
      .sort((a, b) => (a.pt.value ?? 0) - (b.pt.value ?? 0));
  }, [pop, data, visible]);

  const empty = data && withData.length === 0;

  return (
    <section aria-labelledby="history-title" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="history-title" className="text-base font-semibold">
          {t("title")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={shipping} onCheckedChange={setShipping} />
            {t("withShipping")}
          </label>
        </div>
      </div>

      {/* One row: range presets + actions. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={t("range")} className="flex flex-wrap gap-1">
          {VIEW_RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {t(`ranges.${r}`)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            aria-pressed={table}
            onClick={() => setTable((v) => !v)}
          >
            {table ? <LineChartIcon aria-hidden /> : <Table2 aria-hidden />}
            {table ? t("viewChart") : t("viewTable")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={exportPng}
            disabled={!data || table || !!empty}
          >
            <ImageDown aria-hidden />
            {t("exportPng")}
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data || !!empty}>
            <Download aria-hidden />
            {t("exportCsv")}
          </Button>
        </div>
      </div>

      {failed && (
        <p role="alert" className="text-destructive text-sm">
          {t("error")}
        </p>
      )}

      {!data && !failed ? (
        <Skeleton className="h-80 w-full" />
      ) : empty ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          {t("empty")}
        </p>
      ) : data ? (
        <div
          aria-busy={loading}
          className={cn("grid min-w-0 gap-3 transition-opacity", loading && "opacity-60")}
        >
          {table ? (
            <div
              tabIndex={0}
              role="region"
              aria-label={t("tableLabel")}
              className="focus-visible:ring-ring/50 max-h-96 overflow-auto rounded-xl border outline-none focus-visible:ring-[3px]"
            >
              <table className="w-full text-sm">
                <caption className="sr-only">{summary}</caption>
                <thead className="bg-muted text-muted-foreground sticky top-0 text-left">
                  <tr>
                    {(["time", "merchant", "price", "shipping", "stock"] as const).map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className={cn(
                          "px-3 py-2 font-medium",
                          (c === "price" || c === "shipping") && "text-right",
                        )}
                      >
                        {t(`columns.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tableRows.map(({ ts, name, p }) => (
                    <tr key={`${name}-${ts}`}>
                      <td className="whitespace-nowrap px-3 py-1.5">{dateTime(ts)}</td>
                      <td className="px-3 py-1.5">{name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {priceFmt(p.obs!.price)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {priceFmt(p.obs!.shipping)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {p.inStock ? t("inStock") : t("outOfStock")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div ref={wrapRef} className="relative min-w-0">
              <ChartContainer
                config={{}}
                role="img"
                aria-label={summary}
                className="aspect-auto h-80 w-full min-w-0 justify-start"
              >
                <ComposedChart
                  data={rows}
                  margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                  onClick={(s) => {
                    const ts = Number(s?.activeLabel);
                    const c = s?.activeCoordinate;
                    if (isFinite(ts) && c) setPop({ x: c.x ?? 0, y: c.y ?? 0, ts });
                  }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                    minTickGap={32}
                    tickFormatter={(v: number) => tick(v)}
                  />
                  <YAxis
                    width={56}
                    domain={yDomain}
                    allowDataOverflow
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                    tickFormatter={(v: number) => price0(v)}
                  />
                  <Tooltip
                    isAnimationActive={false}
                    cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
                    content={renderTooltip}
                  />
                  <Area
                    dataKey="band"
                    type="stepAfter"
                    stroke="none"
                    fill="var(--foreground)"
                    fillOpacity={0.1}
                    connectNulls={false}
                    isAnimationActive={false}
                    activeDot={false}
                    legendType="none"
                  />
                  {refPrice != null && (
                    <ReferenceLine
                      y={refPrice}
                      stroke="var(--chart-axis)"
                      strokeWidth={1.5}
                      strokeDasharray="2 4"
                      ifOverflow="hidden"
                      label={{
                        value: t("refLine", { price: priceFmt(refPrice) }),
                        position: "insideTopLeft",
                        fill: "var(--chart-axis)",
                        fontSize: 11,
                      }}
                    />
                  )}
                  {bought && (
                    <ReferenceLine
                      x={bought.at}
                      stroke="var(--foreground)"
                      strokeWidth={1.5}
                      ifOverflow="hidden"
                      label={{
                        value: t("boughtLabel"),
                        position: "insideTopRight",
                        fill: "var(--foreground)",
                        fontSize: 11,
                      }}
                    />
                  )}
                  {visible.map((m) => (
                    <Line
                      key={m.id}
                      dataKey={m.id}
                      type="stepAfter"
                      stroke={m.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeDasharray={m.dash}
                      strokeOpacity={dim(m.id)}
                      dot={false}
                      activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                      legendType="none"
                    />
                  ))}
                  {visible.map((m) => (
                    <Line
                      key={m.id + OOS_SUFFIX}
                      dataKey={m.id + OOS_SUFFIX}
                      type="stepAfter"
                      stroke={m.color}
                      strokeWidth={2}
                      strokeDasharray="2 4"
                      strokeOpacity={0.55 * dim(m.id)}
                      dot={false}
                      activeDot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                      legendType="none"
                    />
                  ))}
                  {lows.map(({ m, ts, value }) => (
                    <ReferenceDot
                      key={`low-${m.id}`}
                      x={ts}
                      y={value}
                      ifOverflow="hidden"
                      shape={(p: { cx?: number; cy?: number }) => {
                        const { cx = 0, cy = 0 } = p;
                        return (
                          <path
                            d={`M${cx} ${cy - 7}L${cx + 7} ${cy}L${cx} ${cy + 7}L${cx - 7} ${cy}Z`}
                            fill={m.color}
                            fillOpacity={dim(m.id)}
                            stroke="var(--background)"
                            strokeWidth={2}
                            strokeLinejoin="round"
                          />
                        );
                      }}
                    />
                  ))}
                  {currents.map(({ m, ts, value }) => (
                    <ReferenceDot
                      key={`now-${m.id}`}
                      x={ts}
                      y={value}
                      r={5}
                      ifOverflow="hidden"
                      fill={m.color}
                      fillOpacity={dim(m.id)}
                      stroke="var(--background)"
                      strokeWidth={2}
                    />
                  ))}
                  {desktop && rows.length > 2 && (
                    <Brush
                      dataKey="ts"
                      height={28}
                      travellerWidth={10}
                      stroke="var(--border)"
                      fill="var(--muted)"
                      startIndex={start}
                      endIndex={end}
                      tickFormatter={(v: number) => dateShort(v)}
                      onChange={(r) => setBrush({ start: r.startIndex ?? 0, end: r.endIndex ?? 0 })}
                    />
                  )}
                </ComposedChart>
              </ChartContainer>
              <Popover open={pop != null} onOpenChange={(o) => !o && setPop(null)}>
                <PopoverAnchor asChild>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute size-0"
                    style={{ left: pop?.x ?? 0, top: pop?.y ?? 0 }}
                  />
                </PopoverAnchor>
                <PopoverContent className="max-h-80 w-80 max-w-[90vw] overflow-auto" align="start">
                  {pop && (
                    <div className="grid gap-3">
                      <p className="font-medium">{dateTime(pop.ts)}</p>
                      {popList.length === 0 && (
                        <p className="text-muted-foreground">{t("noOffers")}</p>
                      )}
                      {popList.map(({ m, pt }) => {
                        const link = safeHttpUrl(pt.obs.url);
                        return (
                          <div key={m.id} className="grid gap-1 text-xs">
                            <div className="flex items-center gap-2">
                              <Key color={m.color} dash={m.dash} faded={!pt.inStock} />
                              <span className="font-semibold tabular-nums">
                                {priceFmt(pt.value ?? pt.obs.price)}
                              </span>
                              <span className="text-muted-foreground">{m.name}</span>
                            </div>
                            {pt.obs.title && <p className="break-words">{pt.obs.title}</p>}
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {link && (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline underline-offset-2"
                                >
                                  {t("openShop")}
                                </a>
                              )}
                              {pt.obs.runId && (
                                <>
                                  <a
                                    href={`#diag-${m.id}`}
                                    className="text-primary underline underline-offset-2"
                                    onClick={() => setPop(null)}
                                  >
                                    {t("viewLog")}
                                  </a>
                                  {isAdmin && (
                                    <Link
                                      href={`/admin/runs/${pt.obs.runId}`}
                                      className="text-primary underline underline-offset-2"
                                    >
                                      {t("viewRun", { id: pt.obs.runId.slice(0, 8) })}
                                    </Link>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Legend: click toggles, hover highlights, double-click isolates. */}
          <ul
            aria-label={t("legend")}
            className="-mx-1 flex flex-nowrap gap-x-3 gap-y-1 overflow-x-auto px-1 pb-1 sm:flex-wrap"
          >
            {withData.map((m) => {
              const off = hidden.includes(m.id);
              return (
                <li key={m.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={!off}
                    title={t("legendHint")}
                    onClick={() => toggle(m.id)}
                    onDoubleClick={() => isolate(m.id)}
                    onMouseEnter={() => setHighlight(m.id)}
                    onMouseLeave={() => setHighlight(null)}
                    onFocus={() => setHighlight(m.id)}
                    onBlur={() => setHighlight(null)}
                    className={cn(
                      "focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs outline-none focus-visible:ring-[3px]",
                      off && "opacity-50",
                    )}
                  >
                    <Key color={m.color} dash={m.dash} />
                    <span className={cn("text-foreground", off && "line-through")}>{m.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <ul
            className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
            aria-label={t("marks")}
          >
            <li className="flex items-center gap-1.5">
              <Key color="var(--foreground)" dash="2 4" faded />
              {t("keyOutOfStock")}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="bg-foreground/10 h-2.5 w-4 rounded-[2px]" />
              {t("keyBand")}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="bg-foreground size-2 rotate-45" />
              {t("keyLow")}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="bg-foreground size-2.5 rounded-full" />
              {t("keyNow")}
            </li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}
