"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useServerAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeEmail } from "./actions";

export function EmailSection({ email }: { email: string }) {
  const t = useTranslations("Account.settings.email");
  const { pending, run } = useServerAction();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription className="break-all">{t("description", { email })}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changeEmail({ newEmail, currentPassword: password }), {
              success: t("saved"),
              onSuccess: () => {
                setNewEmail("");
                setPassword("");
              },
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="new-email">{t("newEmail")}</Label>
            <Input
              id="new-email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email-password">{t("currentPassword")}</Label>
            <Input
              id="email-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" disabled={pending || !newEmail.includes("@") || !password}>
              {t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
