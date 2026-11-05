"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { BuildChartData, ChartRow } from "@/lib/charts/dashboard";
import { DAY_MS } from "@/lib/charts/transforms";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "1y", days: 365 },
  { key: "all", days: null },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];
type Mode = "anywhere" | "single";
const REF = "__ref";

export function BuildTotalChart({ data }: { data: BuildChartData }) {
  const t = useTranslations("Charts.buildTotal");
  const tc = useTranslations("Charts.category");
  const format = useFormatter();
  const [range, setRange] = useState<RangeKey>("90d");
  const [mode, setMode] = useState<Mode>("anywhere");
  const [table, setTable] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const catLabel = (key: string) => tc(key as "cpu");
  const price = (v: number) => format.number(v, "price");
  const axisPrice = (v: number) =>
    format.number(v, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const dateLabel = (ts: number, long = false) =>
    format.dateTime(
      ts,
      long ? { dateStyle: "medium", timeStyle: "short" } : { day: "numeric", month: "short" },
    );

  const all = mode === "anywhere" ? data.anywhere : data.single;
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const from = days == null ? -Infinity : now - days * DAY_MS;
    return all
      .filter((r) => r.ts >= from)
      .map((r) => ({
        ...r,
        // The reference total is a constant (today's reference prices), drawn for comparison.
        [REF]: data.refTotal,
      })) as (ChartRow & { [REF]: number | null })[];
  }, [all, range, now, data.refTotal]);

  const shownCats = data.categories.filter((c) => !hidden.has(c.key));
  const visibleTotal = (r: ChartRow) => {
    if (r.total == null) return null;
    return shownCats.reduce((n, c) => n + ((r[c.key] as number | null) ?? 0), 0);
  };
  const priced = rows.filter((r) => r.total != null);
  const first = priced[0]?.total ?? null;
  const last = priced[priced.length - 1]?.total ?? null;
  const change = first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;
  const modeName = t(mode === "anywhere" ? "modeAnywhere" : "modeSingle");
  const summary =
    last == null
      ? t("summaryNone", { mode: modeName })
      : t("summary", {
          mode: modeName,
          price: price(last),
          pct: change == null ? 0 : Math.round(Math.abs(change)),
          dir: change == null || Math.round(change) === 0 ? "flat" : change < 0 ? "down" : "up",
          days: RANGES.find((r) => r.key === range)!.days ?? 0,
        }) + (data.refTotal != null ? ` ${t("summaryRef", { ref: price(data.refTotal) })}` : "");

  const config: ChartConfig = Object.fromEntries(
    data.categories.map((c) => [
      c.key,
      { label: catLabel(c.key), color: `var(--chart-merchant-${c.slot})` },
    ]),
  );
  const maxY = Math.max(0, ...rows.map((r) => Math.max(r.total ?? 0, data.refTotal ?? 0)));

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function isolate(key: string) {
    const all = [...data.categories.map((c) => c.key), REF];
    setHidden((prev) => {
      const only = all.every((k) => (k === key ? !prev.has(k) : prev.has(k)));
      return only ? new Set() : new Set(all.filter((k) => k !== key));
    });
  }

  return (
    <section aria-labelledby="build-total-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="build-total-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {data.withShipping ? t("withShipping") : t("withoutShipping")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={table}
          onClick={() => setTable((v) => !v)}
        >
          {table ? t("viewChart") : t("viewTable")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label={t("range")} className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={range === r.key ? "secondary" : "ghost"}
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
            >
              {t(`range_${r.key}`)}
            </Button>
          ))}
        </div>
        <div role="group" aria-label={t("mode")} className="flex flex-wrap gap-1">
          {(["anywhere", "single"] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "secondary" : "ghost"}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {t(m === "anywhere" ? "modeAnywhere" : "modeSingle")}
            </Button>
          ))}
        </div>
      </div>

      {priced.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          {mode === "single" && data.single.length > 0 ? t("emptySingle") : t("empty")}
        </p>
      ) : table ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={t("tableLabel")}
          className="focus-visible:ring-ring/50 max-h-80 overflow-auto rounded-xl border outline-none focus-visible:ring-[3px]"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{summary}</caption>
            <thead className="bg-muted text-muted-foreground sticky top-0 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("date")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("total")}
                </th>
                {data.categories.map((c) => (
                  <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {catLabel(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...rows].reverse().map((r) => (
                <tr key={r.ts}>
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal">
                    {dateLabel(r.ts, true)}
                  </th>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {r.total == null ? "–" : price(r.total)}
                  </td>
                  {data.categories.map((c) => (
                    <td key={c.key} className="px-3 py-1.5 text-right tabular-nums">
                      {r[c.key] == null ? "–" : price(r[c.key] as number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ChartContainer
          config={config}
          role="img"
          aria-label={summary}
          className="aspect-auto h-72 w-full justify-start"
        >
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={32}
              tickFormatter={(v: number) => dateLabel(v)}
            />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              domain={[0, Math.ceil(maxY * 1.05)]}
              tickFormatter={(v: number) => axisPrice(v)}
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as ChartRow | undefined) : undefined;
                if (!row) return null;
                const total = visibleTotal(row);
                const parts = shownCats
                  .map((c) => ({ ...c, v: row[c.key] as number | null }))
                  .filter((c) => c.v != null)
                  .sort((a, b) => b.v! - a.v!);
                return (
                  <div className="bg-popover text-popover-foreground grid min-w-48 gap-1.5 rounded-lg border px-3 py-2 text-xs shadow-md">
                    <div className="text-muted-foreground">{dateLabel(row.ts, true)}</div>
                    {total == null ? (
                      <div className="text-muted-foreground">{t("noPrice")}</div>
                    ) : (
                      <div className="text-sm font-semibold tabular-nums">{price(total)}</div>
                    )}
                    {parts.map((c) => (
                      <div key={c.key} className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-0.5 w-3 shrink-0 rounded"
                          style={{ background: `var(--chart-merchant-${c.slot})` }}
                        />
                        <span className="font-medium tabular-nums">{price(c.v!)}</span>
                        <span className="text-muted-foreground">{catLabel(c.key)}</span>
                      </div>
                    ))}
                    {!hidden.has(REF) && data.refTotal != null && (
                      <div className="flex items-center gap-2 border-t pt-1.5">
                        <span
                          aria-hidden
                          className="border-foreground h-0 w-3 shrink-0 border-t-2 border-dashed"
                        />
                        <span className="font-medium tabular-nums">{price(data.refTotal)}</span>
                        <span className="text-muted-foreground">{t("reference")}</span>
                      </div>
                    )}
                    {row.missing > 0 && mode === "anywhere" && (
                      <div className="text-muted-foreground">
                        {t("missing", { count: row.missing })}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {shownCats.map((c) => (
              <Area
                key={c.key}
                dataKey={c.key}
                type="stepAfter"
                stackId="total"
                stroke="var(--card)"
                strokeWidth={2}
                fill={`var(--chart-merchant-${c.slot})`}
                fillOpacity={0.85}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
              />
            ))}
            {!hidden.has(REF) && data.refTotal != null && (
              <Line
                dataKey={REF}
                type="stepAfter"
                stroke="var(--foreground)"
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeLinejoin="round"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      )}

      {priced.length > 0 && !table && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t("legend")}>
          {data.categories.map((c) => (
            <LegendItem
              key={c.key}
              off={hidden.has(c.key)}
              label={catLabel(c.key)}
              onToggle={() => toggle(c.key)}
              onIsolate={() => isolate(c.key)}
              swatch={
                <span
                  aria-hidden
                  className="size-2.5 rounded-[2px]"
                  style={{ background: `var(--chart-merchant-${c.slot})` }}
                />
              }
            />
          ))}
          {data.refTotal != null && (
            <LegendItem
              off={hidden.has(REF)}
              label={t("reference")}
              onToggle={() => toggle(REF)}
              onIsolate={() => isolate(REF)}
              swatch={
                <span aria-hidden className="border-foreground h-0 w-3 border-t-2 border-dashed" />
              }
            />
          )}
        </ul>
      )}
    </section>
  );
}

function LegendItem({
  label,
  swatch,
  off,
  onToggle,
  onIsolate,
}: {
  label: string;
  swatch: React.ReactNode;
  off: boolean;
  onToggle: () => void;
  onIsolate: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={!off}
        onClick={onToggle}
        onDoubleClick={onIsolate}
        className={cn(
          "focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-sm text-xs outline-none focus-visible:ring-[3px]",
          off && "opacity-50",
        )}
      >
        {swatch}
        <span className="text-foreground">{label}</span>
      </button>
    </li>
  );
}
