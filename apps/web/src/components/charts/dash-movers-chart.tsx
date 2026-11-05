"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Mover } from "@/lib/charts/transforms";
import { cn } from "@/lib/utils";

type Days = "7" | "30";

function barColor(pct: number) {
  return Math.abs(pct) < 0.05
    ? "var(--chart-div-mid)"
    : pct < 0
      ? "var(--chart-div-neg)"
      : "var(--chart-div-pos)";
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
        /*
         * A diverging bar list in HTML rather than an SVG chart: every product name is shown in
         * full (SVG axis labels had to be cut to a few characters), with the change and the
         * before → now prices written beside each bar. Bars grow from the centre line.
         */
        <ul role="list" aria-label={summary} className="grid gap-3">
          {rows.map((m) => {
            const drop = m.pct < 0;
            const width = `${Math.min(50, (Math.abs(m.pct) / bound) * 50)}%`;
            return (
              <li key={m.productId} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/products/${m.productId}`}
                    className="line-clamp-2 min-w-0 text-sm font-medium hover:underline"
                  >
                    {m.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums">
                    {drop ? (
                      <ArrowDown className="size-3.5" aria-hidden />
                    ) : (
                      <ArrowUp className="size-3.5" aria-hidden />
                    )}
                    {pct(m.pct)}
                    <span className="sr-only">{drop ? t("drop") : t("rise")}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div aria-hidden className="bg-muted relative h-2.5 flex-1 rounded-full">
                    <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[var(--chart-axis)]" />
                    <span
                      className={cn(
                        "absolute inset-y-0 rounded-full",
                        drop ? "right-1/2 rounded-r-none" : "left-1/2 rounded-l-none",
                      )}
                      style={{ width, background: barColor(m.pct) }}
                    />
                  </div>
                  <span className="text-muted-foreground w-40 shrink-0 text-right font-mono text-xs tabular-nums">
                    {price(m.from)} → {price(m.to)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
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
                  "focus-visible:outline-ring flex items-center gap-1.5 rounded-sm text-xs focus-visible:outline-2 focus-visible:outline-offset-2",
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
