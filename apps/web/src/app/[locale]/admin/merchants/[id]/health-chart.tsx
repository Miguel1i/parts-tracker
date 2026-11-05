"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { HEALTH_STATUSES, type DayHealth, type HealthStatus } from "@/lib/admin/health";
import { cn } from "@/lib/utils";

/*
 * Status colours are reserved for status meaning, so every one is named in the legend and in
 * the table view; colour is never the only carrier.
 */
const config = {
  ok: { theme: { light: "#1baf7a", dark: "#199e70" } },
  out_of_stock: { theme: { light: "#898781", dark: "#898781" } },
  not_found: { theme: { light: "#eda100", dark: "#c98500" } },
  blocked: { theme: { light: "#eb6834", dark: "#d95926" } },
  error: { theme: { light: "#e34948", dark: "#e66767" } },
} satisfies ChartConfig;

type Row = DayHealth & Record<HealthStatus, number>;

export function HealthChart({ days }: { days: DayHealth[] }) {
  const t = useTranslations("Admin.merchants.healthChart");
  const format = useFormatter();
  const [table, setTable] = useState(false);
  const [hidden, setHidden] = useState<Set<HealthStatus>>(new Set());

  const total = days.reduce((n, d) => n + d.total, 0);
  const sum = (s: HealthStatus) => days.reduce((n, d) => n + d.counts[s], 0);
  const shown = HEALTH_STATUSES.filter((s) => !hidden.has(s));
  const rows: Row[] = days.map((d) => ({ ...d, ...d.counts }));
  const dayLabel = (day: string, style: "short" | "long" = "short") =>
    format.dateTime(new Date(`${day}T12:00:00Z`), {
      timeZone: "UTC",
      ...(style === "short" ? { day: "numeric", month: "short" } : { dateStyle: "medium" }),
    });
  const pct = (v: number) => format.number(v, { style: "percent", maximumFractionDigits: 0 });
  const summary = t("summary", {
    total,
    ok: pct(total ? sum("ok") / total : 0),
    days: days.length,
  });

  function toggle(s: HealthStatus) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next.size === HEALTH_STATUSES.length ? new Set() : next;
    });
  }

  return (
    <section aria-labelledby="health-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="health-title" className="text-base font-semibold">
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

      {total === 0 ? (
        <p className="text-muted-foreground rounded-[6px] border border-dashed px-4 py-10 text-center text-sm">
          {t("empty")}
        </p>
      ) : table ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={t("tableLabel")}
          className="focus-visible:outline-ring max-h-80 overflow-auto rounded-[6px] border focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{summary}</caption>
            <thead className="bg-muted text-muted-foreground sticky top-0 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("day")}
                </th>
                {HEALTH_STATUSES.map((s) => (
                  <th key={s} scope="col" className="px-3 py-2 text-right font-medium">
                    {t(`status.${s}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal">
                    {dayLabel(d.day, "long")}
                  </th>
                  {HEALTH_STATUSES.map((s) => (
                    <td key={s} className="px-3 py-1.5 text-right tabular-nums">
                      {d.total === 0 ? "–" : `${d.counts[s]} (${pct(d.shares[s])})`}
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
          role="figure"
          aria-label={summary}
          className="aspect-auto h-64 w-full justify-start"
        >
          <BarChart
            data={rows}
            stackOffset="expand"
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={24}
              tickFormatter={(d: string) => dayLabel(d)}
            />
            <YAxis
              width={40}
              tickLine={false}
              axisLine={false}
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v: number) => pct(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                if (!row) return null;
                return (
                  <div className="bg-popover text-popover-foreground grid min-w-44 gap-1.5 rounded-[6px] border px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]">
                    <div className="font-medium">{dayLabel(row.day, "long")}</div>
                    {row.total === 0 ? (
                      <div className="text-muted-foreground">{t("noChecks")}</div>
                    ) : (
                      HEALTH_STATUSES.filter((s) => row.counts[s] > 0).map((s) => (
                        <div key={s} className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-[2px]"
                            style={{ background: `var(--color-${s})` }}
                          />
                          <span className="font-medium tabular-nums">
                            {pct(row.shares[s])} · {row.counts[s]}
                          </span>
                          <span className="text-muted-foreground">{t(`status.${s}`)}</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              }}
            />
            {shown.map((s) => (
              <Bar
                key={s}
                dataKey={s}
                stackId="health"
                fill={`var(--color-${s})`}
                stroke="var(--background)"
                strokeWidth={1}
                maxBarSize={20}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}

      {total > 0 && !table && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t("legend")}>
          {HEALTH_STATUSES.map((s) => (
            <li key={s}>
              <button
                type="button"
                aria-pressed={!hidden.has(s)}
                onClick={() => toggle(s)}
                className={cn(
                  "focus-visible:outline-ring flex items-center gap-1.5 rounded-sm text-xs focus-visible:outline-2 focus-visible:outline-offset-2",
                  hidden.has(s) && "opacity-50",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-[2px]"
                  style={{ background: `var(--color-${s})` }}
                />
                <span className="text-foreground">{t(`status.${s}`)}</span>
                <span className="text-muted-foreground tabular-nums">{sum(s)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
