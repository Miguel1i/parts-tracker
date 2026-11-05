"use client";

import { Check, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { approveUser, rejectPendingUser } from "./actions";

export type PendingUser = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  createdAt: Date;
};

/**
 * New sign-ups waiting for an admin (signup mode "approval"): the first thing on the Users page.
 * Approve enables the account; Reject deletes it (it never had access, so nothing else is lost).
 */
export function PendingPanel({ users }: { users: PendingUser[] }) {
  const t = useTranslations("Admin.users.pending");
  const format = useFormatter();
  const { pending, run } = useAdminAction();

  return (
    <section aria-labelledby="pending-title" className="bg-card mb-8 rounded-md border">
      <header className="flex items-baseline justify-between gap-3 border-b px-5 py-3">
        <h2 id="pending-title" className="font-semibold">
          {t("title")}
        </h2>
        <span className="text-muted-foreground font-mono text-xs uppercase tracking-[0.08em]">
          {t("count", { count: users.length })}
        </span>
      </header>
      {users.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-sm">{t("none")}</p>
      ) : (
        <ul className="divide-y">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {u.name}
                  {u.username && (
                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                      @{u.username}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground truncate text-sm">
                  {u.email} ·{" "}
                  {t("signedUp", { when: format.dateTime(u.createdAt, { dateStyle: "medium" }) })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => approveUser({ userId: u.id }), {
                      success: t("approved", { name: u.name }),
                    })
                  }
                >
                  <Check aria-hidden />
                  {t("approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => rejectPendingUser({ userId: u.id }), {
                      success: t("rejected", { name: u.name }),
                    })
                  }
                >
                  <X aria-hidden />
                  {t("reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
