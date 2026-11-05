"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { moveMerchant, setMerchantFlag } from "./actions";

export type MerchantRow = {
  id: string;
  name: string;
  country: string | null;
  currency: string;
  shipping: number;
  freeShippingOver: number | null;
  enabled: boolean;
  visibleToUsers: boolean;
  ownOnly: boolean;
  needsBrowser: boolean;
  color: string | null;
  lastHealth: "ok" | "degraded" | "blocked" | null;
  lastHealthAt: Date | null;
};

const healthClass = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  degraded: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "text-muted-foreground",
} as const;

export function MerchantsTable({ rows }: { rows: MerchantRow[] }) {
  const t = useTranslations("Admin.merchants");
  const format = useFormatter();
  const { pending, run } = useAdminAction();
  const money = (value: number, currency: string) =>
    format.number(value, { style: "currency", currency });
  const safeMoney = (value: number, currency: string) => {
    try {
      return money(value, currency);
    } catch {
      return `${value} ${currency}`;
    }
  };

  return (
    <div className="overflow-x-auto rounded-[6px] border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.name")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("columns.country")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("columns.currency")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("columns.shipping")}</TableHead>
            <TableHead>{t("columns.enabled")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("columns.visible")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("columns.flags")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("columns.health")}</TableHead>
            <TableHead className="text-right">{t("columns.order")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m, index) => {
            const health = m.lastHealth ?? "unknown";
            return (
              <TableRow key={m.id}>
                <TableCell className="max-w-[10rem] font-medium sm:max-w-none">
                  <span className="flex items-center gap-2">
                    {m.color && (
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: m.color }}
                      />
                    )}
                    <Link
                      href={`/admin/merchants/${m.id}`}
                      className="focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 truncate rounded underline-offset-4 hover:underline"
                    >
                      {m.name}
                    </Link>
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell">{m.country ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">{m.currency}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="tabular-nums">{safeMoney(m.shipping, m.currency)}</span>
                  {m.freeShippingOver != null && (
                    <span className="text-muted-foreground block text-xs">
                      {t("freeOver", { amount: safeMoney(m.freeShippingOver, m.currency) })}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={m.enabled}
                    disabled={pending}
                    aria-label={t("toggle.enabled", { name: m.name })}
                    onCheckedChange={(value) =>
                      run(() => setMerchantFlag({ id: m.id, flag: "enabled", value }))
                    }
                  />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Switch
                    checked={m.visibleToUsers}
                    disabled={pending}
                    aria-label={t("toggle.visible", { name: m.name })}
                    onCheckedChange={(value) =>
                      run(() => setMerchantFlag({ id: m.id, flag: "visibleToUsers", value }))
                    }
                  />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {m.ownOnly && <Badge variant="secondary">{t("ownOnly")}</Badge>}
                    {m.needsBrowser && <Badge variant="secondary">{t("needsBrowser")}</Badge>}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline" className={cn(healthClass[health])}>
                    {t(`health.${health}`)}
                  </Badge>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {m.lastHealthAt
                      ? t("health.checked", {
                          when: format.dateTime(m.lastHealthAt, {
                            dateStyle: "short",
                            timeStyle: "short",
                          }),
                        })
                      : t("health.never")}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending || index === 0}
                      aria-label={t("moveUp", { name: m.name })}
                      onClick={() => run(() => moveMerchant({ id: m.id, direction: "up" }))}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending || index === rows.length - 1}
                      aria-label={t("moveDown", { name: m.name })}
                      onClick={() => run(() => moveMerchant({ id: m.id, direction: "down" }))}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
