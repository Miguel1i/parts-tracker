"use client";

import { Table2, BarChart3 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { safeHttpUrl } from "@/lib/charts/product-view";
import { cn } from "@/lib/utils";

export type OfferView = {
  merchantId: string;
  merchantName: string;
  color: string;
  price: number;
  shipping: number;
  inStock: boolean;
  checkedAt: number | null;
  url: string | null;
};

export function ProductOffersChart({
  offers,
  withShipping,
}: {
  offers: OfferView[];
  /** Whether the user compares prices with shipping (decides the cheapest). */
  withShipping: boolean;
}) {
  const t = useTranslations("Product.offers");
  const format = useFormatter();
  const [table, setTable] = useState(false);
  const [showShipping, setShowShipping] = useState(true);

  const priceFmt = (n: number) => format.number(n, "price");
  const compared = (o: OfferView) => o.price + (withShipping ? o.shipping : 0);
  const sorted = [...offers].sort(
    (a, b) => Number(b.inStock) - Number(a.inStock) || compared(a) - compared(b),
  );
  const cheapest = sorted.find((o) => o.inStock);
  const rows = sorted.map((o) => ({
    ...o,
    ship: showShipping ? o.shipping : 0,
    total: o.price + (showShipping ? o.shipping : 0),
  }));
  const when = (ts: number | null) =>
    ts == null
      ? "–"
      : format.dateTime(ts, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" });
  const summary = cheapest
    ? t("summary", { price: priceFmt(compared(cheapest)), merchant: cheapest.merchantName })
    : t("summaryNone");
  const barFill = (o: OfferView) => (!o.inStock ? "var(--muted-foreground)" : o.color);
  const barOpacity = (o: OfferView) => (!o.inStock ? 0.35 : o === cheapest ? 1 : 0.6);

  return (
    <section aria-labelledby="offers-title" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="offers-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            aria-pressed={showShipping}
            onClick={() => setShowShipping((v) => !v)}
          >
            {t("shipping")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={table}
            onClick={() => setTable((v) => !v)}
          >
            {table ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
            {table ? t("viewChart") : t("viewTable")}
          </Button>
        </div>
      </div>

      {offers.length === 0 ? (
        <p className="text-muted-foreground rounded-[6px] border border-dashed px-4 py-10 text-center text-sm">
          {t("empty")}
        </p>
      ) : (
        <>
          {!table && (
            <ChartContainer
              config={{}}
              role="figure"
              aria-label={summary}
              className="aspect-auto w-full min-w-0 justify-start"
              style={{ height: Math.max(140, rows.length * 40 + 40) }}
            >
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 64, bottom: 0, left: 0 }}
                barCategoryGap={8}
              >
                <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} />
                <XAxis
                  type="number"
                  domain={[0, "dataMax"]}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    format.number(v, {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    })
                  }
                />
                <YAxis
                  type="category"
                  dataKey="merchantName"
                  width={104}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
                  tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)}
                />
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    const o = active
                      ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                      : undefined;
                    if (!o) return null;
                    return (
                      <div className="bg-popover text-popover-foreground grid min-w-44 gap-1 rounded-[6px] border px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]">
                        <div className="font-semibold tabular-nums">
                          {priceFmt(o.price + o.shipping)}{" "}
                          <span className="text-muted-foreground font-normal">
                            {o.merchantName}
                          </span>
                        </div>
                        <div className="text-muted-foreground tabular-nums">
                          {t("tooltip", {
                            price: priceFmt(o.price),
                            shipping: priceFmt(o.shipping),
                          })}
                        </div>
                        <div className="text-muted-foreground">
                          {o.inStock ? t("inStock") : t("outOfStock")}
                          {o === cheapest && ` · ${t("cheapest")}`}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="price"
                  stackId="offer"
                  maxBarSize={24}
                  isAnimationActive={false}
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  {rows.map((o) => (
                    <Cell key={o.merchantId} fill={barFill(o)} fillOpacity={barOpacity(o)} />
                  ))}
                </Bar>
                <Bar
                  dataKey="ship"
                  stackId="offer"
                  maxBarSize={24}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                  fill="var(--muted-foreground)"
                  fillOpacity={0.35}
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  <LabelList
                    dataKey="total"
                    position="right"
                    fill="var(--foreground)"
                    fontSize={11}
                    formatter={(v: unknown) => priceFmt(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
          {!table && (
            <ul
              className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
              aria-label={t("legend")}
            >
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="bg-foreground size-2.5 rounded-[2px]" />
                {t("keyPrice")}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="bg-muted-foreground/40 size-2.5 rounded-[2px]" />
                {t("keyShipping")}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="bg-muted-foreground/35 size-2.5 rounded-[2px]" />
                {t("outOfStock")}
              </li>
            </ul>
          )}
          <div
            tabIndex={0}
            role="region"
            aria-label={t("tableLabel")}
            className={cn(
              "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 overflow-x-auto rounded-[6px] border",
              !table && "mt-1",
            )}
          >
            <table className="w-full text-sm">
              <caption className="sr-only">{summary}</caption>
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("columns.merchant")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("columns.price")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("columns.shipping")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("columns.stock")}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                    {t("columns.checked")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">{t("columns.link")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((o) => {
                  const link = safeHttpUrl(o.url);
                  return (
                    <tr key={o.merchantId} className={cn(!o.inStock && "text-muted-foreground")}>
                      <th scope="row" className="px-3 py-1.5 text-left font-medium">
                        {o.merchantName}
                        {o === cheapest && (
                          <span className="bg-secondary text-secondary-foreground ml-2 rounded px-1.5 py-0.5 text-xs font-normal">
                            {t("cheapest")}
                          </span>
                        )}
                      </th>
                      <td className="px-3 py-1.5 text-right tabular-nums">{priceFmt(o.price)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {priceFmt(o.shipping)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {o.inStock ? t("inStock") : t("outOfStock")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">{when(o.checkedAt)}</td>
                      <td className="px-3 py-1.5">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
