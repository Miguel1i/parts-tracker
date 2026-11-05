"use client";

import { Laptop } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useActionErrorText } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient, useSession } from "@/lib/auth/client";

type Row = {
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/** Browser and OS from a user agent, good enough for "which device is this". */
function describeAgent(ua: string | null | undefined) {
  if (!ua) return { browser: null, os: null };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return { browser, os };
}

export function SessionsSection() {
  const t = useTranslations("Account.settings.sessions");
  const errorText = useActionErrorText();
  const format = useFormatter();
  const { data: current } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.code);
      setRows((data as Row[]) ?? []);
    } catch {
      setRows([]);
      toast.error(errorText("generic"));
    }
    // errorText is recreated each render; the list only needs to load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    authClient
      .listSessions()
      .then(({ data }) => {
        if (!cancelled) setRows((data as Row[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(fn: () => Promise<{ error: unknown }>, success: string) {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw new Error("failed");
      toast.success(success);
      await load();
    } catch {
      toast.error(errorText("generic"));
    } finally {
      setBusy(false);
    }
  }

  const currentToken = current?.session?.token;
  const others = (rows ?? []).filter((r) => r.token !== currentToken);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows === null ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ul className="divide-y rounded-[4px] border">
            {rows.map((r) => {
              const { browser, os } = describeAgent(r.userAgent);
              const isCurrent = r.token === currentToken;
              const label =
                browser && os ? `${browser} · ${os}` : (browser ?? os ?? t("unknownDevice"));
              return (
                <li key={r.token} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Laptop className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {label}
                        {isCurrent && <Badge variant="secondary">{t("thisDevice")}</Badge>}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {r.ipAddress ? `${r.ipAddress} · ` : ""}
                        {t("created", {
                          date: format.dateTime(new Date(r.createdAt), { dateStyle: "medium" }),
                        })}
                        {" · "}
                        {t("lastActive", {
                          date: format.dateTime(new Date(r.updatedAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }),
                        })}
                      </div>
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        act(() => authClient.revokeSession({ token: r.token }), t("revoked"))
                      }
                    >
                      {t("revoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div>
          <Button
            variant="outline"
            disabled={busy || others.length === 0}
            onClick={() => act(() => authClient.revokeOtherSessions(), t("revokedOthers"))}
          >
            {t("revokeOthers")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
