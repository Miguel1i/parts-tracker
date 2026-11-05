"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useActionErrorText } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { checkNow, getRunStatus } from "./actions";

const POLL_MS = 4000;
const GIVE_UP_MS = 15 * 60_000;
const TERMINAL = ["succeeded", "failed", "cancelled"];

type Log = {
  productName: string | null;
  merchantName: string | null;
  status: string;
  message: string | null;
};
type RunState = {
  id: string;
  status: string;
  logs: Log[];
  command?: string;
  gaveUp?: boolean;
};

/** "Check now": queues a run, then polls its status every 4 s until it ends. */
export function CheckButton({ buildId, label }: { buildId: string; label?: string }) {
  const t = useTranslations("Builds.check");
  const router = useRouter();
  const errorText = useActionErrorText();
  const [starting, startTransition] = useTransition();
  const [run, setRun] = useState<RunState | null>(null);
  const startedAt = useRef(0);
  const inFlight = useRef(false);

  const active = !!run && !run.gaveUp && !TERMINAL.includes(run.status);
  const runId = run?.id;

  useEffect(() => {
    if (!runId || !active) return;
    const timer = setInterval(async () => {
      if (inFlight.current) return;
      if (Date.now() - startedAt.current > GIVE_UP_MS) {
        setRun((r) => (r ? { ...r, gaveUp: true } : r));
        return;
      }
      inFlight.current = true;
      try {
        const res = await getRunStatus({ runId });
        if (!res.ok) {
          setRun((r) => (r ? { ...r, gaveUp: true } : r));
          return;
        }
        const { status, logs } = res.data;
        setRun((r) => (r && r.id === runId ? { ...r, status, logs } : r));
        if (TERMINAL.includes(status)) {
          router.refresh();
          if (status === "succeeded") toast.success(t("done"));
          else toast.error(t(status === "failed" ? "failed" : "cancelled"));
        } else if (logs.length > 0) {
          router.refresh();
        }
      } catch {
        // Network blip: the next tick retries.
      } finally {
        inFlight.current = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [runId, active, router, t]);

  function start() {
    startTransition(async () => {
      try {
        const res = await checkNow({ buildId });
        if (!res.ok) {
          toast.error(errorText(res.error, res.meta));
          return;
        }
        startedAt.current = Date.now();
        setRun({ id: res.data.runId, status: "queued", logs: [], command: res.data.command });
      } catch {
        toast.error(t("error"));
      }
    });
  }

  const finished = run?.logs.length ?? 0;
  return (
    <div className="grid gap-2">
      <Button onClick={start} disabled={starting || active} className="w-fit">
        {starting || active ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        {active ? t("running") : (label ?? t("button"))}
      </Button>
      {run && (
        <div className="text-muted-foreground grid gap-1 text-sm" aria-live="polite">
          <p>
            {run.gaveUp
              ? t("gaveUp")
              : run.status === "queued"
                ? t("queued")
                : run.status === "running"
                  ? t("progress", { count: finished })
                  : t(run.status === "succeeded" ? "summary" : "failed", { count: finished })}
          </p>
          {run.command && !TERMINAL.includes(run.status) && (
            <p>
              {t("localCommand")}{" "}
              <code className="bg-muted rounded px-1 py-0.5">{run.command}</code>
            </p>
          )}
          {run.logs.length > 0 && !active && (
            <details>
              <summary className="cursor-pointer">{t("details")}</summary>
              <ul className="mt-1 grid gap-0.5">
                {run.logs.map((l, i) => (
                  <li key={i} className="break-words">
                    <span className="text-foreground">{l.productName}</span> · {l.merchantName} ·{" "}
                    {t(`status.${l.status}` as "status.ok")}
                    {l.message ? ` (${l.message})` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
