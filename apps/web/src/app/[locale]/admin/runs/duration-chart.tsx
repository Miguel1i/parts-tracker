"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { RunDuration } from "@/lib/admin/health";

const config = {
  minutes: { theme: { light: "#2a78d6", dark: "#3987e5" } },
} satisfies ChartConfig;

export function DurationChart({ runs }: { runs: RunDuration[] }) {
  const t = useTranslations("Admin.runs.chart");
  const format = useFormatter();
  const [table, setTable] = useState(false);

  const when = (ms: number, style: "short" | "long" = "long") =>
    format.dateTime(
      ms,
      style === "short"
        ? { day: "numeric", month: "short" }
        : { dateStyle: "medium", timeStyle: "short" },
    );
  const min = (v: number) =>
    t("minutes", { value: format.number(v, { maximumFractionDigits: 1 }) });
  const last = runs.at(-1);
  const slowest = runs.reduce((a, r) => (r.minutes > a ? r.minutes : a), 0);
  const summary = runs.length
    ? t("summary", { count: runs.length, last: min(last!.minutes), max: min(slowest) })
    : t("empty");

  return (
    <section aria-labelledby="duration-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="duration-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        {runs.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={table}
            onClick={() => setTable((v) => !v)}
          >
            {table ? t("viewChart") : t("viewTable")}
          </Button>
        )}
      </div>

      {runs.length === 0 ? (
        <p className="text-muted-foreground rounded-[6px] border border-dashed px-4 py-10 text-center text-sm">
          {t("empty")}
        </p>
      ) : table ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={t("tableLabel")}
          className="focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 max-h-80 overflow-auto rounded-[6px] border"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{summary}</caption>
            <thead className="bg-muted text-muted-foreground sticky top-0 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("started")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("duration")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...runs].reverse().map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal">
                    {when(r.startedAt)}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{min(r.minutes)}</td>
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
          className="aspect-auto h-56 w-full justify-start"
        >
          <LineChart data={runs} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="startedAt"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={32}
              tickFormatter={(v: number) => when(v, "short")}
            />
            <YAxis
              // Wide enough for the largest label (an unusually long run must not clip).
              width={Math.max(32, format.number(Math.ceil(slowest)).length * 8 + 12)}
              tickLine={false}
              axisLine={false}
              domain={[0, "auto"]}
              allowDecimals={false}
              tickFormatter={(v: number) => format.number(v)}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const run = active ? (payload?.[0]?.payload as RunDuration | undefined) : undefined;
                if (!run) return null;
                return (
                  <div className="bg-popover text-popover-foreground grid gap-1 rounded-[6px] border px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-0.5 w-3 shrink-0"
                        style={{ background: "var(--color-minutes)" }}
                      />
                      <span className="font-medium tabular-nums">{min(run.minutes)}</span>
                    </div>
                    <div className="text-muted-foreground">{when(run.startedAt)}</div>
                  </div>
                );
              }}
            />
            <Line
              dataKey="minutes"
              type="linear"
              stroke="var(--color-minutes)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              connectNulls={false}
              dot={{
                r: 4,
                fill: "var(--color-minutes)",
                stroke: "var(--background)",
                strokeWidth: 2,
              }}
              activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </section>
  );
}
