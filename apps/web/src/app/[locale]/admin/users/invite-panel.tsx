"use client";

import { Mail, X } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Locale } from "@/i18n/routing";
import { inviteUser, revokeInvite } from "./actions";

type Invite = { id: string; email: string; role: "admin" | "user"; expiresAt: Date };

export function InvitePanel({ invites }: { invites: Invite[] }) {
  const t = useTranslations("Admin.users.invite");
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const { pending, run } = useAdminAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(() => inviteUser({ email: email.trim(), role, locale }), {
      success: t("sent", { email: email.trim() }),
      onSuccess: () => setEmail(""),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="@container grid gap-4">
        <form onSubmit={submit} className="@md:flex-row @md:items-end flex flex-col gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="invite-email">{t("email")}</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-role">{t("role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "user" | "admin")}>
              <SelectTrigger id="invite-role" className="@md:w-28 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t("roles.user")}</SelectItem>
                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={pending}>
            <Mail className="size-4" />
            {t("send")}
          </Button>
        </form>
        {invites.length > 0 && (
          <div>
            <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
              {t("open", { count: invites.length })}
            </h3>
            <ul className="divide-y rounded-md border">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{i.email}</span>
                  {i.role === "admin" && <Badge variant="secondary">{t("roles.admin")}</Badge>}
                  <span className="text-muted-foreground hidden text-xs sm:inline">
                    {t("expires", { when: format.dateTime(i.expiresAt, { dateStyle: "medium" }) })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("revoke", { email: i.email })}
                    disabled={pending}
                    onClick={() =>
                      run(() => revokeInvite({ inviteId: i.id }), { success: t("revoked") })
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
