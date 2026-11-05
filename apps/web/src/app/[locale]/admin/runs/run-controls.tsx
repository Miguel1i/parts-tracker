"use client";

import { Play, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rerun, runAll, setCronInterval } from "./actions";
import { CRON_HOURS } from "./hours";

type Dispatched = { dispatched: true } | { dispatched: false; command: string };

function useDispatchToast() {
  const t = useTranslations("Admin.runs");
  return (data: Dispatched) => {
    if (data.dispatched) toast.success(t("dispatched"));
    else toast.message(t("notDispatched"), { description: data.command, duration: 20000 });
  };
}

export function CheckAllButton() {
  const t = useTranslations("Admin.runs");
  const { pending, run } = useAdminAction();
  const notify = useDispatchToast();
  return (
    <Button disabled={pending} onClick={() => run(() => runAll({}), { onSuccess: notify })}>
      <Play className="size-4" aria-hidden />
      {pending ? t("starting") : t("checkAll")}
    </Button>
  );
}

export function RerunButton({ runId }: { runId: string }) {
  const t = useTranslations("Admin.runs");
  const { pending, run } = useAdminAction();
  const notify = useDispatchToast();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => run(() => rerun({ runId }), { onSuccess: notify })}
    >
      <RotateCw className="size-4" aria-hidden />
      {pending ? t("starting") : t("rerun")}
    </Button>
  );
}

export function CronIntervalSelect({ hours }: { hours: number }) {
  const t = useTranslations("Admin.runs.cron");
  const { pending, run } = useAdminAction();
  const options = CRON_HOURS.includes(hours as (typeof CRON_HOURS)[number])
    ? [...CRON_HOURS]
    : [...CRON_HOURS, hours].sort((a, b) => a - b);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="cron-interval">{t("label")}</Label>
      <Select
        value={String(hours)}
        disabled={pending}
        onValueChange={(v) =>
          run(() => setCronInterval({ hours: Number(v) }), { success: t("saved") })
        }
      >
        <SelectTrigger id="cron-interval" className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {t("option", { hours: h })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">{t("hint")}</p>
    </div>
  );
}
