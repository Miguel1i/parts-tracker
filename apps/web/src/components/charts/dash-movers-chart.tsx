"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type RectangleProps,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { Mover } from "@/lib/charts/transforms";
import { cn } from "@/lib/utils";

type Days = "7" | "30";
const config = { pct: { label: "%", color: "var(--chart-div-neg)" } } satisfies ChartConfig;

function short(name: string, max = 24) {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

/** Bars round only at the data end (left for drops, right for rises). */
function MoverBar(props: RectangleProps & { payload?: Mover }) {
  const pct = props.payload?.pct ?? 0;
  const fill =
    Math.abs(pct) < 0.05
      ? "var(--chart-div-mid)"
      : pct < 0
        ? "var(--chart-div-neg)"
        : "var(--chart-div-pos)";
  const radius: [number, number, number, number] = pct < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0];
  return <Rectangle {...props} fill={fill} radius={radius} />;
}

export function MoversChart({ data }: { data: Record<Days, Mover[]> }) {
  const t = useTranslations("Charts.movers");
  const format = useFormatter();
  const [days, setDays] = useState<Days>("7");
  const [table, setTable] = useState(false);
  const [hideDrops, setHideDrops] = useState(false);
  const [hideRises, setHideRises] = useState(false);

  const pct = (v: number) =>
    format.number(v / 100, {
      style: "percent",
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    });
  const price = (v: number) => format.number(v, "price");
  const rows = data[days].filter((m) => (m.pct < 0 ? !hideDrops : !hideRises));
  const all = data[days];
  const biggest = all.reduce<Mover | null>(
    (b, m) => (!b || Math.abs(m.pct) > Math.abs(b.pct) ? m : b),
    null,
  );
  const summary = biggest
    ? t("summary", {
        days: Number(days),
        name: biggest.name,
        pct: pct(biggest.pct),
        count: all.length,
      })
    : t("summaryNone", { days: Number(days) });
  const limit = Math.max(1, ...rows.map((m) => Math.abs(m.pct)));
  const bound = Math.ceil(limit * 1.1);

  return (
    <section aria-labelledby="movers-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="movers-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
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
      <div role="group" aria-label={t("range")} className="flex gap-1">
        {(["7", "30"] as const).map((d) => (
          <Button
            key={d}
            size="sm"
            variant={days === d ? "secondary" : "ghost"}
            aria-pressed={days === d}
            onClick={() => setDays(d)}
          >
            {t(`range_${d}`)}
          </Button>
        ))}
      </div>

      {all.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          {t("empty")}
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
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("product")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("before")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("now")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("change")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {all.map((m) => (
                <tr key={m.productId}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    {m.name}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{price(m.from)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{price(m.to)}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{pct(m.pct)}</td>
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
          className="aspect-auto w-full justify-start"
          style={{ height: Math.max(120, rows.length * 32 + 40) }}
        >
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
            barSize={18}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              type="number"
              domain={[-bound, bound]}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(v: number) => pct(v)}
              tickCount={5}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => short(v)}
            />
            <ReferenceLine x={0} stroke="var(--chart-axis)" strokeWidth={1} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload }) => {
                const m = active ? (payload?.[0]?.payload as Mover | undefined) : undefined;
                if (!m) return null;
                const drop = m.pct < 0;
                return (
                  <div className="bg-popover text-popover-foreground grid max-w-64 gap-1 rounded-lg border px-3 py-2 text-xs shadow-md">
                    <div className="break-words font-medium">{m.name}</div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                      {drop ? (
                        <ArrowDown className="size-3.5" aria-hidden />
                      ) : (
                        <ArrowUp className="size-3.5" aria-hidden />
                      )}
                      {pct(m.pct)}
                      <span className="text-muted-foreground text-xs font-normal">
                        {drop ? t("drop") : t("rise")}
                      </span>
                    </div>
                    <div className="text-muted-foreground tabular-nums">
                      {price(m.from)} → {price(m.to)}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="pct" shape={<MoverBar />} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      )}

      {all.length > 0 && !table && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t("legend")}>
          {(
            [
              ["drop", "var(--chart-div-neg)", ArrowDown, hideDrops, setHideDrops],
              ["rise", "var(--chart-div-pos)", ArrowUp, hideRises, setHideRises],
            ] as const
          ).map(([key, color, Icon, off, set]) => (
            <li key={key}>
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => set(!off)}
                className={cn(
                  "focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-sm text-xs outline-none focus-visible:ring-[3px]",
                  off && "opacity-50",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-[2px]"
                  style={{ background: color }}
                />
                <Icon className="size-3" aria-hidden />
                <span className="text-foreground">{t(`${key}Label`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
