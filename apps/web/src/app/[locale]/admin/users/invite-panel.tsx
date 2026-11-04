"use client";

import { Copy, Link2, X } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { inviteLink, inviteUser, revokeInvite } from "./actions";

type Invite = { id: string; email: string; role: "admin" | "user"; expiresAt: Date };

export function InvitePanel({ invites }: { invites: Invite[] }) {
  const t = useTranslations("Admin.users.invite");
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const { pending, run } = useAdminAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const to = email.trim();
    run(() => inviteUser({ email: to, role, locale }), {
      onSuccess: (data) => {
        setEmail("");
        toast.success(data.emailed ? t("emailed", { email: to }) : t("sent", { email: to }));
        setLink({ email: to, url: data.url });
      },
    });
  }

  function showLink(invite: Invite) {
    run(() => inviteLink({ inviteId: invite.id, locale }), {
      onSuccess: (data) => setLink({ email: invite.email, url: data.url }),
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      // Clipboard blocked: the link stays selectable in the dialog.
    }
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
            <Link2 className="size-4" />
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
                    aria-label={t("copyLink", { email: i.email })}
                    disabled={pending}
                    onClick={() => showLink(i)}
                  >
                    <Link2 className="size-4" />
                  </Button>
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
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("linkTitle", { email: link?.email ?? "" })}</DialogTitle>
            <DialogDescription>{t("linkHelp")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link?.url ?? ""}
              aria-label={t("linkTitle", { email: link?.email ?? "" })}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" onClick={() => link && copy(link.url)}>
              <Copy className="size-4" />
              {t("copy")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
