"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { heatBin, safeShopUrl, type CompareCellData, type CompareRow } from "@/lib/charts/compare";
import type { CompareMerchant } from "@/lib/charts/compare-data";
import { MerchantMark } from "./compare-grid";

// Literal class names so Tailwind sees them. Text flips with the palette: in dark mode the
// sequential steps run from dark (best) to light.
const BIN_STYLE: Record<number, string> = {
  1: "text-neutral-900 dark:text-white",
  2: "text-neutral-900 dark:text-white",
  3: "text-neutral-900 dark:text-white",
  4: "text-white",
  5: "text-white dark:text-neutral-900",
  6: "text-white dark:text-neutral-900",
  7: "text-white dark:text-neutral-900",
};
const BINS = [1, 2, 3, 4, 5, 6, 7] as const;

function Swatch({ bin, className = "" }: { bin: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={"inline-block rounded-sm border " + className}
      style={{ backgroundColor: `var(--chart-seq-${bin})` }}
    />
  );
}

export function CompareHeatmap({
  buildName,
  rows,
  merchants,
  onViewTable,
}: {
  buildName: string;
  rows: CompareRow[];
  merchants: CompareMerchant[];
  onViewTable: () => void;
}) {
  const t = useTranslations("Compare");
  const format = useFormatter();

  function detail(cell: CompareCellData | undefined) {
    if (!cell || cell.total == null) return t("heatmap.noData");
    const price = format.number(cell.total, "price");
    const stock =
      cell.status === "ok"
        ? t("stock.inStock")
        : cell.status === "out_of_stock"
          ? t("stock.outOfStock")
          : cell.status === "not_found"
            ? t("stock.notFound")
            : "";
    const gap =
      cell.pct == null
        ? ""
        : cell.isBest
          ? t("heatmap.isBest")
          : t("heatmap.above", { pct: format.number(cell.pct, { maximumFractionDigits: 1 }) });
    return [price, gap, stock].filter(Boolean).join(", ");
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-foreground font-medium">{t("heatmap.legend")}</span>
          {BINS.map((bin) => (
            <span key={bin} className="inline-flex items-center gap-1.5">
              <Swatch bin={bin} className="size-3.5" />
              {t(`heatmap.bins.${bin}` as "heatmap.bins.1")}
            </span>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={onViewTable}>
          {t("heatmap.viewTable")}
        </Button>
      </div>
      <div
        className="max-h-[70vh] overflow-auto rounded-[6px] border"
        role="group"
        aria-label={t("heatmap.summary", { products: rows.length, merchants: merchants.length })}
      >
        <div
          className="grid min-w-max gap-px"
          style={{
            gridTemplateColumns: `minmax(11rem, 15rem) repeat(${merchants.length}, minmax(6.5rem, 1fr))`,
          }}
        >
          <div className="bg-muted sticky left-0 top-0 z-30 px-3 py-2 text-sm font-medium">
            {buildName}
          </div>
          {merchants.map((m) => (
            <div
              key={m.id}
              className="bg-muted sticky top-0 z-20 flex items-center gap-2 px-3 py-2 text-sm font-medium"
            >
              <MerchantMark merchant={m} />
              <span className="break-words">{m.name}</span>
            </div>
          ))}
          {rows.map((row) => [
            <div
              key={row.productId}
              className="bg-background sticky left-0 z-10 px-3 py-2 text-sm font-medium"
            >
              {row.name}
            </div>,
            ...merchants.map((m) => {
              const cell = row.cells[m.id];
              const bin = cell?.pct != null ? heatBin(cell.pct) : null;
              const href = safeShopUrl(cell?.url);
              const label = t("heatmap.cell", {
                product: row.name,
                merchant: m.name,
                detail: detail(cell),
              });
              const common = {
                "aria-label": label,
                className:
                  "flex min-h-14 flex-col items-center justify-center px-2 py-2 text-center text-xs outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-ring " +
                  (bin
                    ? BIN_STYLE[bin] + " hover:brightness-110"
                    : "bg-muted/40 text-muted-foreground"),
                style: bin
                  ? { backgroundColor: `var(--chart-seq-${bin})` }
                  : {
                      backgroundImage:
                        "repeating-linear-gradient(135deg, transparent 0 5px, var(--chart-grid) 5px 6px)",
                    },
              };
              const inner =
                cell && cell.total != null ? (
                  <>
                    <span className={"tabular-nums " + (cell.isBest ? "font-bold" : "font-medium")}>
                      {format.number(cell.total, "price")}
                    </span>
                    <span>
                      {cell.pct == null
                        ? t("stock.outOfStock")
                        : cell.isBest
                          ? t("heatmap.best")
                          : `+${format.number(cell.pct, { maximumFractionDigits: 0 })}%`}
                    </span>
                  </>
                ) : (
                  <span aria-hidden>—</span>
                );
              return (
                <Tooltip key={`${row.productId}-${m.id}`}>
                  <TooltipTrigger asChild>
                    {href ? (
                      <a {...common} href={href} target="_blank" rel="noopener noreferrer">
                        {inner}
                      </a>
                    ) : (
                      <div {...common} tabIndex={0}>
                        {inner}
                      </div>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="grid gap-0.5">
                      <span className="font-semibold">{row.name}</span>
                      <span>
                        {m.name}: {detail(cell)}
                      </span>
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}
