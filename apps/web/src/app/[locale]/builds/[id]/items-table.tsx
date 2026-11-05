"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Flag,
  MoreHorizontal,
  ShoppingCart,
  Trash2,
  Undo2,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useServerAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { BuildItemView } from "@/lib/builds/queries";
import {
  clearBought,
  moveItem,
  removeItem,
  reportWrongMatch,
  setBought,
  setQuantity,
} from "./actions";

type Merchant = { id: string; name: string };
type Run = ReturnType<typeof useServerAction>["run"];

function Quantity({ buildId, item, run }: { buildId: string; item: BuildItemView; run: Run }) {
  const t = useTranslations("Builds.items");
  const [value, setValue] = useState(String(item.quantity));
  const [prev, setPrev] = useState(item.quantity);
  if (prev !== item.quantity) {
    // The server value changed (refresh): show it.
    setPrev(item.quantity);
    setValue(String(item.quantity));
  }
  function commit() {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      setValue(String(item.quantity));
      return;
    }
    if (n !== item.quantity)
      run(() => setQuantity({ buildId, productId: item.productId, quantity: n }));
  }
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      max={99}
      value={value}
      aria-label={t("quantityOf", { name: item.name })}
      className="w-16"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function Offer({ item, onReport }: { item: BuildItemView; onReport: () => void }) {
  const t = useTranslations("Builds.items");
  const format = useFormatter();
  const o = item.offer;
  if (!o) return <span className="text-muted-foreground text-sm">{t("noPrice")}</span>;
  return (
    <div className="grid gap-0.5 text-sm">
      <span className="font-medium tabular-nums">{format.number(o.unitTotal, "price")}</span>
      <span className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-xs">
        {o.url ? (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 hover:underline"
          >
            {o.merchantName}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          o.merchantName
        )}
        {o.shipping > 0 && (
          <span>{t("withShipping", { amount: format.number(o.shipping, "price") })}</span>
        )}
      </span>
      {o.checkedAt && (
        <span className="text-muted-foreground text-xs">
          {t("checked", {
            when: format.dateTime(new Date(o.checkedAt), {
              dateStyle: "short",
              timeStyle: "short",
            }),
          })}
        </span>
      )}
      <button
        type="button"
        onClick={onReport}
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
      >
        <Flag className="size-3" aria-hidden />
        {t("report.action")}
      </button>
    </div>
  );
}

function BoughtBadge({ item, merchants }: { item: BuildItemView; merchants: Merchant[] }) {
  const t = useTranslations("Builds.items");
  const format = useFormatter();
  if (!item.bought) return null;
  const shop = merchants.find((m) => m.id === item.bought!.merchantId)?.name;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 text-xs">
      <Badge variant="secondary">
        <Check className="size-3" />
        {t("bought")}
      </Badge>
      <span className="text-muted-foreground">
        {[
          item.bought.price != null ? format.number(item.bought.price, "price") : null,
          shop,
          format.dateTime(new Date(item.bought.at), { dateStyle: "medium" }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </span>
  );
}

function ItemMenu({
  item,
  index,
  count,
  onBought,
  onMove,
  onClear,
  onRemove,
}: {
  item: BuildItemView;
  index: number;
  count: number;
  onBought: () => void;
  onMove: (d: "up" | "down") => void;
  onClear: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Builds.items");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("menu", { name: item.name })}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onBought}>
          <ShoppingCart className="size-4" />
          {item.bought ? t("editBought") : t("markBought")}
        </DropdownMenuItem>
        {item.bought && (
          <DropdownMenuItem onSelect={onClear}>
            <Undo2 className="size-4" />
            {t("clearBought")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={index === 0} onSelect={() => onMove("up")}>
          <ArrowUp className="size-4" />
          {t("moveUp")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove("down")}>
          <ArrowDown className="size-4" />
          {t("moveDown")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 className="size-4" />
          {t("remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BoughtDialog({
  buildId,
  item,
  merchants,
  onClose,
  pending,
  run,
}: {
  buildId: string;
  item: BuildItemView | null;
  merchants: Merchant[];
  onClose: () => void;
  pending: boolean;
  run: Run;
}) {
  const t = useTranslations("Builds.items.boughtDialog");
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {item && (
          <BoughtForm
            key={item.productId}
            buildId={buildId}
            item={item}
            merchants={merchants}
            onClose={onClose}
            pending={pending}
            run={run}
            title={t("title")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BoughtForm({
  buildId,
  item,
  merchants,
  onClose,
  pending,
  run,
  title,
}: {
  buildId: string;
  item: BuildItemView;
  merchants: Merchant[];
  onClose: () => void;
  pending: boolean;
  run: Run;
  title: string;
}) {
  const t = useTranslations("Builds.items.boughtDialog");
  const initialPrice = item.bought?.price ?? item.offer?.price ?? null;
  const [price, setPrice] = useState(initialPrice != null ? String(initialPrice) : "");
  const [merchantId, setMerchantId] = useState(
    item.bought?.merchantId ?? item.offer?.merchantId ?? "none",
  );
  const [date, setDate] = useState(() =>
    new Date(item.bought?.at ?? Date.now()).toISOString().slice(0, 10),
  );
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = price.trim() === "" ? null : Number(price.replace(",", "."));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    run(
      () =>
        setBought({
          buildId,
          productId: item.productId,
          price: parsed,
          merchantId: merchantId === "none" ? null : merchantId,
          date,
        }),
      { success: t("saved"), onSuccess: onClose },
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="break-words">{item.name}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="bought-price">{t("price")}</Label>
        <Input
          id="bought-price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0,00"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bought-merchant">{t("merchant")}</Label>
        <Select value={merchantId} onValueChange={setMerchantId}>
          <SelectTrigger id="bought-merchant" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("noMerchant")}</SelectItem>
            {merchants.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bought-date">{t("date")}</Label>
        <Input
          id="bought-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !date}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ReportDialog({
  buildId,
  item,
  onClose,
  pending,
  run,
}: {
  buildId: string;
  item: BuildItemView | null;
  onClose: () => void;
  pending: boolean;
  run: Run;
}) {
  const t = useTranslations("Builds.items.report");
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setReason("");
        }
      }}
    >
      <DialogContent>
        {item?.offer && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  reportWrongMatch({
                    buildId,
                    productId: item.productId,
                    merchantId: item.offer!.merchantId,
                    reason: reason.trim() || undefined,
                  }),
                {
                  success: t("sent"),
                  onSuccess: () => {
                    setReason("");
                    onClose();
                  },
                },
              );
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>
                {t("body", { name: item.name, merchant: item.offer.merchantName })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="report-reason">{t("reason")}</Label>
              <Textarea
                id="report-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("reasonPlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ItemsTable({
  buildId,
  items,
  merchants,
  total,
  missingPrice,
}: {
  buildId: string;
  items: BuildItemView[];
  merchants: Merchant[];
  total: number;
  missingPrice: number;
}) {
  const t = useTranslations("Builds.items");
  const format = useFormatter();
  const { pending, run } = useServerAction();
  const [boughtFor, setBoughtFor] = useState<BuildItemView | null>(null);
  const [reporting, setReporting] = useState<BuildItemView | null>(null);

  const menu = (item: BuildItemView, index: number) => (
    <ItemMenu
      item={item}
      index={index}
      count={items.length}
      onBought={() => setBoughtFor(item)}
      onMove={(direction) => run(() => moveItem({ buildId, productId: item.productId, direction }))}
      onClear={() => run(() => clearBought({ buildId, productId: item.productId }))}
      onRemove={() =>
        run(() => removeItem({ buildId, productId: item.productId }), { success: t("removed") })
      }
    />
  );
  const lineTotal = (item: BuildItemView) =>
    item.offer ? format.number(item.offer.unitTotal * item.quantity, "price") : "–";

  return (
    <>
      {/* Phones: one card per part. */}
      <ul className="grid gap-2 sm:hidden">
        {items.map((item, index) => (
          <li key={item.productId} className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium">{item.name}</p>
                <BoughtBadge item={item} merchants={merchants} />
              </div>
              {menu(item, index)}
            </div>
            <div className="flex items-end justify-between gap-3">
              <Offer item={item} onReport={() => setReporting(item)} />
              <div className="grid justify-items-end gap-1">
                <Quantity buildId={buildId} item={item} run={run} />
                <span className="text-sm font-medium tabular-nums">{lineTotal(item)}</span>
              </div>
            </div>
          </li>
        ))}
        <li className="flex items-center justify-between rounded-lg border p-3 text-sm font-medium">
          <span>{t("total")}</span>
          <span className="tabular-nums">{format.number(total, "price")}</span>
        </li>
      </ul>

      {/* Larger screens: a table that scrolls inside its own container. */}
      <div className="hidden rounded-lg border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("part")}</TableHead>
              <TableHead className="w-24">{t("quantity")}</TableHead>
              <TableHead>{t("bestPrice")}</TableHead>
              <TableHead className="text-right">{t("lineTotal")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.productId}>
                <TableCell className="max-w-72 whitespace-normal align-top">
                  <span className="break-words font-medium">{item.name}</span>
                  <BoughtBadge item={item} merchants={merchants} />
                </TableCell>
                <TableCell className="align-top">
                  <Quantity buildId={buildId} item={item} run={run} />
                </TableCell>
                <TableCell className="align-top">
                  <Offer item={item} onReport={() => setReporting(item)} />
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {lineTotal(item)}
                </TableCell>
                <TableCell className="align-top">{menu(item, index)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>
                {t("total")}
                {missingPrice > 0 && (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {t("missing", { count: missingPrice })}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {format.number(total, "price")}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <BoughtDialog
        buildId={buildId}
        item={boughtFor}
        merchants={merchants}
        onClose={() => setBoughtFor(null)}
        pending={pending}
        run={run}
      />
      <ReportDialog
        buildId={buildId}
        item={reporting}
        onClose={() => setReporting(null)}
        pending={pending}
        run={run}
      />
    </>
  );
}
