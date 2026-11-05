"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { CompareRow } from "@/lib/charts/compare";
import type { CompareMerchant } from "@/lib/charts/compare-data";
import { CellBody, CellMenu } from "./compare-cell";

export function MerchantMark({ merchant }: { merchant: CompareMerchant }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[3px] w-4 shrink-0 rounded"
      style={{
        background: merchant.dash
          ? `repeating-linear-gradient(90deg, ${merchant.color} 0 6px, transparent 6px 10px)`
          : merchant.color,
      }}
    />
  );
}

export function CompareGrid({
  buildId,
  buildName,
  rows,
  merchants,
}: {
  buildId: string;
  buildName: string;
  rows: CompareRow[];
  merchants: CompareMerchant[];
}) {
  const t = useTranslations("Compare");
  const format = useFormatter();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<CompareRow>[]>(
    () => [
      {
        id: "product",
        header: t("table.product"),
        accessorFn: (r) => r.name,
        sortingFn: "alphanumeric",
        cell: ({ row }) => (
          <Link
            href={`/products/${row.original.productId}`}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      ...merchants.map((m): ColumnDef<CompareRow> => ({
        id: `m-${m.id}`,
        header: m.name,
        enableSorting: false,
        accessorFn: (r) => r.cells[m.id]?.total ?? undefined,
        cell: ({ row }) => {
          const cell = row.original.cells[m.id];
          return (
            <div className="flex items-start justify-between gap-1">
              <CellBody cell={cell} />
              {cell && (
                <CellMenu
                  target={{
                    buildId,
                    productId: row.original.productId,
                    productName: row.original.name,
                    merchantId: m.id,
                    merchantName: m.name,
                  }}
                  url={cell.url}
                />
              )}
            </div>
          );
        },
      })),
      {
        id: "best",
        header: t("table.best"),
        accessorFn: (r) => r.bestTotal ?? undefined,
        sortUndefined: "last",
        cell: ({ row }) => {
          const r = row.original;
          if (r.bestTotal == null) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="grid gap-1">
              <span className="font-bold tabular-nums">{format.number(r.bestTotal, "price")}</span>
              <span className="text-muted-foreground text-xs">
                {r.bestMerchantIds
                  .map((id) => merchants.find((m) => m.id === id)?.name)
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </div>
          );
        },
      },
    ],
    [t, merchants, buildId, format],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{t("table.label", { build: buildName })}</caption>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h, i) => {
                const merchant = merchants.find((m) => `m-${m.id}` === h.column.id);
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                    }
                    className={
                      "bg-muted text-foreground sticky top-0 border-b px-3 py-2 text-left align-middle font-medium " +
                      (i === 0 ? "left-0 z-30 border-r" : "z-20 min-w-32")
                    }
                  >
                    {h.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:underline"
                        aria-label={t("table.sortBy", {
                          column: String(h.column.columnDef.header),
                        })}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="text-muted-foreground size-3.5" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        {merchant && <MerchantMark merchant={merchant} />}
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell, i) => {
                const m = merchants.find((x) => `m-${x.id}` === cell.column.id);
                const isBestCell = m ? row.original.cells[m.id]?.isBest : false;
                return (
                  <td
                    key={cell.id}
                    className={
                      "border-b px-3 py-2 align-top " +
                      (i === 0 ? "bg-background sticky left-0 z-10 border-r" : "") +
                      (isBestCell ? "bg-primary/5" : "")
                    }
                  >
                    {i === 0 ? (
                      // The table is min-w-max, so give names a fixed width to wrap in;
                      // otherwise the sticky column pushes every shop off-screen.
                      <div className="w-36 whitespace-normal break-words sm:w-56">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
