"use client";

import { Check, Copy, ExternalLink, Play } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useActionErrorText } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getTestRun, startTestRun } from "./actions";

type RunData = Extract<Awaited<ReturnType<typeof getTestRun>>, { ok: true }>["data"];

const POLL_MS = 3000;
const POLL_LIMIT_MS = 10 * 60 * 1000;
const DONE = new Set(["succeeded", "failed", "cancelled"]);

/** External URLs only become links when they are plain http(s). */
function SafeLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (href && /^https?:\/\//i.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 inline-flex max-w-full items-center gap-1 break-all rounded underline underline-offset-4"
      >
        {children}
        <ExternalLink className="size-3 shrink-0" aria-hidden />
      </a>
    );
  }
  return <span className="break-all">{children}</span>;
}

export function TestPanel({
  merchantId,
  products,
}: {
  merchantId: string;
  products: { id: string; name: string }[];
}) {
  const t = useTranslations("Admin.merchants.test");
  const errorText = useActionErrorText();
  const tc = useTranslations("Admin.common");
  const format = useFormatter();
  const selectId = useId();
  const [productId, setProductId] = useState("");
  const [starting, startTransition] = useTransition();
  const [runId, setRunId] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState<RunData | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const startedAt = Date.now();
    const tick = async () => {
      try {
        const res = await getTestRun({ runId });
        if (cancelled) return;
        if (res.ok) {
          setData(res.data);
          if (DONE.has(res.data.run.status)) return;
        }
      } catch {
        if (cancelled) return;
      }
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        setTimedOut(true);
        return;
      }
      timer.current = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runId]);

  function start() {
    if (!productId) return;
    startTransition(async () => {
      try {
        const res = await startTestRun({ merchantId, productId });
        if (!res.ok) {
          toast.error(errorText(res.error));
          return;
        }
        setData(null);
        setTimedOut(false);
        setCopied(false);
        setCommand(res.data.dispatched ? null : res.data.command);
        if (res.data.dispatched) toast.success(t("dispatched"));
        setRunId(res.data.runId);
      } catch {
        toast.error(tc("error"));
      }
    });
  }

  async function copy() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      /* clipboard unavailable: the command is selectable anyway */
    }
  }

  const status = data?.run.status ?? (runId ? "queued" : null);
  const active = !!runId && !timedOut && !(status && DONE.has(status));
  const dt = (d: Date | null) =>
    d ? format.dateTime(d, { dateStyle: "short", timeStyle: "medium" }) : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {products.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noProducts")}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-md">
              <Label htmlFor={selectId}>{t("product")}</Label>
              <select
                id={selectId}
                value={productId}
                onChange={(ev) => setProductId(ev.target.value)}
                className="border-input bg-background focus-visible:border-ring focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-input/30 h-8 w-full min-w-0 rounded-[4px] border px-2.5 text-sm"
              >
                <option value="">{t("choose")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={start} disabled={!productId || starting || active}>
              <Play aria-hidden />
              {starting || active ? t("running") : t("run")}
            </Button>
          </div>
        )}

        {command && (
          <div className="grid gap-2" role="status">
            <p className="text-sm">{t("notDispatched")}</p>
            <div className="flex items-start gap-2">
              <pre className="bg-muted min-w-0 flex-1 whitespace-pre-wrap break-all rounded-[4px] p-3 font-mono text-xs">
                {command}
              </pre>
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
          </div>
        )}

        {runId && (
          <div className="grid gap-4" aria-live="polite">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t("status")}</dt>
              <dd>
                <Badge variant="outline">{t(`statuses.${status ?? "queued"}` as never)}</Badge>
              </dd>
              <dt className="text-muted-foreground">{t("started")}</dt>
              <dd>{dt(data?.run.startedAt ?? null)}</dd>
              <dt className="text-muted-foreground">{t("finished")}</dt>
              <dd>{dt(data?.run.finishedAt ?? null)}</dd>
              {data?.run.stats && (
                <>
                  <dt className="text-muted-foreground">{t("stats")}</dt>
                  <dd className="break-all font-mono text-xs">{JSON.stringify(data.run.stats)}</dd>
                </>
              )}
              {data?.run.ghRunUrl && (
                <>
                  <dt className="text-muted-foreground">GitHub</dt>
                  <dd>
                    <SafeLink href={data.run.ghRunUrl}>{t("ghRun")}</SafeLink>
                  </dd>
                </>
              )}
            </dl>
            {timedOut && <p className="text-muted-foreground text-sm">{t("pollStopped")}</p>}

            <section className="grid gap-2">
              <h3 className="text-sm font-medium">{t("logs")}</h3>
              {data && data.logs.length > 0 ? (
                data.logs.map((l) => (
                  <div key={l.id} className="grid gap-1">
                    <p className="text-sm">
                      <Badge variant="secondary" className="mr-2">
                        {l.status}
                      </Badge>
                      {l.message}
                    </p>
                    {l.log && (
                      <pre className="bg-muted max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-[4px] p-3 font-mono text-xs">
                        {l.log}
                      </pre>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">{t("noLogs")}</p>
              )}
            </section>

            <section className="grid gap-2">
              <h3 className="text-sm font-medium">{t("candidates")}</h3>
              {data && data.candidates.length > 0 ? (
                <ul className="grid gap-2">
                  {data.candidates.map((c) => (
                    <li key={c.id} className="rounded-[6px] border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{c.status}</Badge>
                        <span className="text-muted-foreground tabular-nums">
                          {t("score")} {c.score.toFixed(2)}
                        </span>
                        {c.priceEur != null && (
                          <span className="tabular-nums">
                            {format.number(c.priceEur, { style: "currency", currency: "EUR" })}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-words">{c.title ?? "—"}</p>
                      <p className="text-xs">
                        <SafeLink href={c.url}>{c.url}</SafeLink>
                      </p>
                      {c.vetoes.length > 0 && (
                        <p className="text-destructive mt-1 text-xs">
                          {t("vetoes", { vetoes: c.vetoes.join(", ") })}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">{t("noCandidates")}</p>
              )}
            </section>

            <section className="grid gap-2">
              <h3 className="text-sm font-medium">{t("points")}</h3>
              {data && data.points.length > 0 ? (
                <ul className="grid gap-2">
                  {data.points.map((p) => (
                    <li key={p.id} className="rounded-[6px] border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {format.number(p.priceEur, { style: "currency", currency: "EUR" })}
                        </span>
                        <Badge variant="secondary">
                          {p.inStock ? t("inStock") : t("outOfStock")}
                        </Badge>
                      </div>
                      <p className="mt-1 break-words">{p.title ?? "—"}</p>
                      {p.url && (
                        <p className="text-xs">
                          <SafeLink href={p.url}>{p.url}</SafeLink>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">{t("noPoints")}</p>
              )}
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
