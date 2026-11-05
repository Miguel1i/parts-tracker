import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusClass: Record<string, string> = {
  succeeded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  running: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  queued: "text-muted-foreground",
  cancelled: "text-muted-foreground",
};

export async function RunStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("Admin.runs");
  return (
    <Badge variant="outline" className={cn(statusClass[status])}>
      {t.has(`statuses.${status}` as "statuses.queued")
        ? t(`statuses.${status}` as "statuses.queued")
        : status}
    </Badge>
  );
}

/** Only real GitHub links are rendered; the column is data, not trusted markup. */
export function safeGhUrl(url: string | null): string | null {
  return url && url.startsWith("https://github.com/") ? url : null;
}

export function durationMs(startedAt: Date | null, finishedAt: Date | null): number | null {
  return startedAt && finishedAt ? Math.max(0, finishedAt.getTime() - startedAt.getTime()) : null;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
