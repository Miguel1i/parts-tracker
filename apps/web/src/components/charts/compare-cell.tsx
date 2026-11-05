"use client";

import { MoreHorizontal } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useActionErrorText, useServerAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { checkNow, reportWrongMatch } from "@/app/[locale]/builds/[id]/actions";
import { pairLog } from "@/app/[locale]/compare/actions";
import { useSession } from "@/lib/auth/client";
import { safeShopUrl, type CompareCellData } from "@/lib/charts/compare";

export type CellTarget = {
  buildId: string;
  productId: string;
  productName: string;
  merchantId: string;
  merchantName: string;
};

type Entry = {
  status: string;
  message: string | null;
  log: string | null;
  createdAt: number | null;
} | null;

const PairLogContext = createContext<((target: CellTarget) => void) | null>(null);

/**
 * Owns the "View log" dialog for every cell. It lives above the grid on purpose: a server
 * action's response can refresh the page, which rebuilds the table cells, and a dialog kept in
 * a cell would be unmounted (it flashed open and closed).
 */
export function PairLogProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Compare");
  const tStatus = useTranslations("Builds.check.status");
  const format = useFormatter();
  const errorText = useActionErrorText();
  const [target, setTarget] = useState<CellTarget | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [entry, setEntry] = useState<Entry | undefined>(undefined);
  const [logError, setLogError] = useState<string | null>(null);

  const openLog = useCallback(
    async (next: CellTarget) => {
      setTarget(next);
      setLogOpen(true);
      setEntry(undefined);
      setLogError(null);
      try {
        const res = await pairLog({
          buildId: next.buildId,
          productId: next.productId,
          merchantId: next.merchantId,
        });
        if (res.ok) setEntry(res.data.entry);
        else setLogError(errorText(res.error, res.meta));
      } catch {
        setLogError(errorText("generic"));
      }
    },
    [errorText],
  );

  return (
    <PairLogContext.Provider value={(next) => void openLog(next)}>
      {children}
      {target && (
        <Dialog open={logOpen} onOpenChange={setLogOpen}>
          <DialogContent className="max-w-2xl" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{t("log.title", { merchant: target.merchantName })}</DialogTitle>
              <DialogDescription>{target.productName}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 text-sm" aria-live="polite">
              {logError ? (
                <p className="text-destructive">{logError}</p>
              ) : entry === undefined ? (
                <p className="text-muted-foreground">…</p>
              ) : entry === null ? (
                <p className="text-muted-foreground">{t("log.empty")}</p>
              ) : (
                <>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="text-muted-foreground">{t("log.status")}</dt>
                    <dd>{tStatus(entry.status as "ok")}</dd>
                    {entry.message && (
                      <>
                        <dt className="text-muted-foreground">{t("log.message")}</dt>
                        <dd className="break-words">{entry.message}</dd>
                      </>
                    )}
                    {entry.createdAt != null && (
                      <>
                        <dt className="text-muted-foreground">{t("log.when")}</dt>
                        <dd>
                          {format.dateTime(new Date(entry.createdAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </dd>
                      </>
                    )}
                  </dl>
                  <pre className="bg-muted max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[4px] p-3 text-xs">
                    {entry.log || t("log.noLog")}
                  </pre>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PairLogContext.Provider>
  );
}

/** The "..." menu of one product x merchant cell. */
export function CellMenu({ target, url }: { target: CellTarget; url: string | null }) {
  const t = useTranslations("Compare");
  const { run } = useServerAction();
  const openLog = useContext(PairLogContext);
  const href = safeShopUrl(url);
  // The raw scrape trace is an admin diagnostic.
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  return (
    <>
      {/*
        Non-modal: a modal menu hands focus back to its trigger as it closes, which a dialog
        opened from one of its items reads as "focus moved outside" and closes right away.
      */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={t("menu.actions", {
              product: target.productName,
              merchant: target.merchantName,
            })}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {href ? (
            <DropdownMenuItem asChild>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {t("menu.open")}
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>{t("menu.noUrl")}</DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() =>
              run(
                () =>
                  reportWrongMatch({
                    buildId: target.buildId,
                    productId: target.productId,
                    merchantId: target.merchantId,
                  }),
                { success: t("menu.reported") },
              )
            }
          >
            {t("menu.report")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              run(() => checkNow({ buildId: target.buildId, productId: target.productId }), {
                success: t("menu.checkQueued"),
              })
            }
          >
            {t("menu.check")}
          </DropdownMenuItem>
          {isAdmin && openLog && (
            <DropdownMenuItem onSelect={() => openLog(target)}>{t("menu.log")}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Muted dash that explains itself on hover and keyboard focus. */
export function DashWithTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="text-muted-foreground cursor-help rounded px-1"
          aria-label={text}
        >
          —
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

/** Stock state of a cell as text: never colour alone. */
export function StockBadge({ cell }: { cell: CompareCellData }) {
  const t = useTranslations("Compare.stock");
  if (cell.status === "ok") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("inStock")}
      </Badge>
    );
  }
  if (cell.status === "out_of_stock") return <Badge variant="secondary">{t("outOfStock")}</Badge>;
  if (cell.status === "not_found") return <Badge variant="secondary">{t("notFound")}</Badge>;
  return null;
}

/** Price + badges (or a muted dash with a tooltip) for one cell. */
export function CellBody({ cell }: { cell: CompareCellData | undefined }) {
  const t = useTranslations("Compare");
  const format = useFormatter();
  if (!cell) return <DashWithTip text={t("stock.notTracked")} />;
  if (cell.status === "blocked") return <DashWithTip text={t("stock.blocked")} />;
  if (cell.status === "error") return <DashWithTip text={t("stock.error")} />;
  if (cell.status == null) return <DashWithTip text={t("stock.unchecked")} />;
  return (
    <div className="grid gap-1">
      <span
        className={
          cell.isBest
            ? "font-bold tabular-nums"
            : cell.inStock
              ? "tabular-nums"
              : "text-muted-foreground tabular-nums"
        }
      >
        {cell.total != null ? format.number(cell.total, "price") : "—"}
      </span>
      <span className="flex flex-wrap gap-1">
        {cell.isBest && <Badge>{t("badge.best")}</Badge>}
        <StockBadge cell={cell} />
      </span>
    </div>
  );
}
