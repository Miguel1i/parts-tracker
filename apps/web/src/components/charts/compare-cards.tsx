"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cardOrder, type CompareRow } from "@/lib/charts/compare";
import type { CompareMerchant } from "@/lib/charts/compare-data";
import { CellBody, CellMenu } from "./compare-cell";
import { MerchantMark } from "./compare-grid";

/** Mobile layout: one card per product, merchants sorted by price, best highlighted. */
export function CompareCards({
  buildId,
  rows,
  merchants,
}: {
  buildId: string;
  rows: CompareRow[];
  merchants: CompareMerchant[];
}) {
  const t = useTranslations("Compare");
  const ids = merchants.map((m) => m.id);
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li key={row.productId}>
          <Card>
            <CardContent className="grid gap-2">
              <Link
                href={`/products/${row.productId}`}
                className="break-words font-medium hover:underline"
              >
                {row.name}
              </Link>
              <ul aria-label={t("cards.label", { product: row.name })} className="grid gap-1">
                {cardOrder(row, ids).map((id) => {
                  const m = merchants.find((x) => x.id === id)!;
                  const cell = row.cells[id];
                  return (
                    <li
                      key={id}
                      className={
                        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 " +
                        (cell?.isBest ? "bg-primary/5 ring-primary/30 ring-1" : "")
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <MerchantMark merchant={m} />
                        <span className="truncate">{m.name}</span>
                      </span>
                      <span className="flex items-center gap-1 text-right">
                        <CellBody cell={cell} />
                        {cell && (
                          <CellMenu
                            target={{
                              buildId,
                              productId: row.productId,
                              productName: row.name,
                              merchantId: id,
                              merchantName: m.name,
                            }}
                            url={cell.url}
                          />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
