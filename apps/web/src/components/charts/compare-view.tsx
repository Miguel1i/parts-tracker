"use client";

import { cn } from "@/lib/utils";

import { Columns3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRouter } from "@/i18n/navigation";
import { buildCompareRows, serializeHide, type RawCell } from "@/lib/charts/compare";
import type { CompareMerchant } from "@/lib/charts/compare-data";
import { CompareCards } from "./compare-cards";
import { CompareGrid } from "./compare-grid";
import { CompareHeatmap } from "./compare-heatmap";

type View = "grid" | "heatmap";

/** Controls (build, view, shops) plus the grid, heatmap or mobile cards. */
export function CompareView({
  builds,
  buildId,
  products,
  merchants,
  cells,
  withShipping,
  initialHidden,
  initialView,
}: {
  builds: { id: string; name: string }[];
  buildId: string;
  products: { id: string; name: string }[];
  merchants: CompareMerchant[];
  cells: RawCell[];
  withShipping: boolean;
  initialHidden: string[];
  initialView: View;
}) {
  const t = useTranslations("Compare");
  const router = useRouter();
  const [hidden, setHidden] = useState(initialHidden);
  const [view, setView] = useState<View>(initialView);

  const shown = useMemo(() => merchants.filter((m) => !hidden.includes(m.id)), [merchants, hidden]);
  const rows = useMemo(
    () =>
      buildCompareRows(
        products,
        shown.map((m) => m.id),
        cells,
      ),
    [products, shown, cells],
  );
  const buildName = builds.find((b) => b.id === buildId)?.name ?? "";

  // URL state without a server round trip.
  function sync(nextHidden: string[], nextView: View) {
    const params = new URLSearchParams(window.location.search);
    const hide = serializeHide(nextHidden);
    if (hide) params.set("hide", hide);
    else params.delete("hide");
    if (nextView === "heatmap") params.set("view", "heatmap");
    else params.delete("view");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }
  function changeHidden(next: string[]) {
    setHidden(next);
    sync(next, view);
  }
  function changeView(next: View) {
    setView(next);
    sync(hidden, next);
  }

  return (
    <TooltipProvider>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {builds.length > 1 && (
          <Select
            value={buildId}
            onValueChange={(id) => router.replace({ pathname: "/compare", query: { build: id } })}
          >
            <SelectTrigger className="w-56 max-w-full" aria-label={t("build")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {builds.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* A view switch, not tabs: there are no tab panels, so it's a pressed-button group. */}
        <div
          role="group"
          aria-label={t("view.label")}
          className="border-border inline-flex h-8 overflow-hidden rounded-[4px] border"
        >
          {(["grid", "heatmap"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => changeView(v)}
              className={cn(
                "focus-visible:outline-ring border-border px-3 text-[0.8125rem] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 [&+&]:border-l",
                view === v
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="size-4" aria-hidden />
              {t("columns.button")}
              {hidden.length > 0 && ` (${merchants.length - hidden.length}/${merchants.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {merchants.map((m) => (
              <DropdownMenuCheckboxItem
                key={m.id}
                checked={!hidden.includes(m.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) =>
                  changeHidden(on ? hidden.filter((h) => h !== m.id) : [...hidden, m.id])
                }
              >
                {m.name}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={hidden.length === 0} onSelect={() => changeHidden([])}>
              {t("columns.show")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-muted-foreground text-sm">
          {withShipping ? t("shipping.with") : t("shipping.without")}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noShops")}</p>
      ) : view === "heatmap" ? (
        <CompareHeatmap
          buildName={buildName}
          rows={rows}
          merchants={shown}
          onViewTable={() => changeView("grid")}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <CompareGrid buildId={buildId} buildName={buildName} rows={rows} merchants={shown} />
          </div>
          <div className="md:hidden">
            <CompareCards buildId={buildId} rows={rows} merchants={shown} />
          </div>
        </>
      )}
    </TooltipProvider>
  );
}
