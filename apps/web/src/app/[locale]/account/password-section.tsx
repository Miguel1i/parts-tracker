"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useActionErrorText } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

export function PasswordSection() {
  const t = useTranslations("Account.settings.password");
  const errorText = useActionErrorText();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = current.length > 0 && next.length >= 8 && next.length <= 128 && next === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: revoke,
      });
      if (error) {
        const code =
          error.code === "INVALID_PASSWORD"
            ? "wrongPassword"
            : error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG"
              ? "invalid"
              : "generic";
        toast.error(errorText(code));
        return;
      }
      toast.success(t("saved"));
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      toast.error(errorText("generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="pw-current">{t("current")}</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-new">{t("new")}</Label>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              maxLength={128}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t("hint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-confirm">{t("confirm")}</Label>
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={mismatch}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <p className="text-destructive text-xs">{t("mismatch")}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="pw-revoke"
              checked={revoke}
              onCheckedChange={(v) => setRevoke(v === true)}
            />
            <Label htmlFor="pw-revoke">{t("revokeOthers")}</Label>
          </div>
          <div>
            <Button type="submit" disabled={busy || !valid}>
              {t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
