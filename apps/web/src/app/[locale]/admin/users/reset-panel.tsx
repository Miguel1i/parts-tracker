"use client";

import { Copy, KeyRound, X } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/routing";
import { dismissReset, resetLink } from "./actions";

export type ResetRequest = {
  id: string;
  requestedAt: Date;
  expiresAt: Date;
  name: string;
  email: string;
  username: string | null;
};

/**
 * "Forgot password" requests. There's no email service by default, so the admin copies the
 * one-time link and sends it to the person themselves. Only shown while there are requests.
 */
export function ResetPanel({ requests }: { requests: ResetRequest[] }) {
  const t = useTranslations("Admin.users.resets");
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const { pending, run } = useAdminAction();
  const [links, setLinks] = useState<Record<string, string>>({});

  if (requests.length === 0) return null;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      // Clipboard blocked: the link stays visible and selectable below.
    }
  }

  return (
    <section aria-labelledby="resets-title" className="bg-card mb-8 rounded-[4px] border">
      <header className="flex items-baseline justify-between gap-3 border-b px-5 py-3">
        <h2 id="resets-title" className="flex items-center gap-2 font-semibold">
          <KeyRound className="text-primary size-4" aria-hidden />
          {t("title")}
        </h2>
        <span className="text-muted-foreground font-mono text-xs uppercase tracking-[0.08em]">
          {t("count", { count: requests.length })}
        </span>
      </header>
      <p className="text-muted-foreground border-b px-5 py-3 text-sm">{t("help")}</p>
      <ul className="divide-y">
        {requests.map((r) => (
          <li key={r.id} className="grid gap-3 px-5 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {r.name || r.email}
                  {r.username && (
                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                      @{r.username}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground truncate text-sm">
                  {r.email} ·{" "}
                  {t("requested", {
                    when: format.dateTime(r.requestedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                    until: format.dateTime(r.expiresAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => resetLink({ resetId: r.id, locale }), {
                      onSuccess: (data) => {
                        setLinks((l) => ({ ...l, [r.id]: data.url }));
                        void copy(data.url);
                      },
                    })
                  }
                >
                  <Copy aria-hidden />
                  {t("copy")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => dismissReset({ resetId: r.id }), { success: t("dismissed") })
                  }
                >
                  <X aria-hidden />
                  {t("dismiss")}
                </Button>
              </div>
            </div>
            {links[r.id] && (
              <Input
                readOnly
                value={links[r.id]}
                aria-label={t("linkLabel", { email: r.email })}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
