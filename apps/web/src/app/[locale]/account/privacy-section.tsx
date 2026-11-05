"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useActionErrorText, useServerAction } from "@/components/admin/use-admin-action";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { exportMyData } from "./actions";

export function PrivacySection() {
  const t = useTranslations("Account.settings.privacy");
  const errorText = useActionErrorText();
  const router = useRouter();
  const { pending, run } = useServerAction();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  function download(data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parts-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const { error } = await authClient.deleteUser({ password });
      if (error) {
        const message = String(error.message ?? "");
        const code =
          error.code === "INVALID_PASSWORD"
            ? "wrongPassword"
            : error.code === "LAST_ADMIN" || message === "lastAdmin"
              ? "lastAdmin"
              : "generic";
        toast.error(errorText(code));
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      toast.error(errorText("generic"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <div className="text-sm font-medium">{t("exportTitle")}</div>
          <p className="text-muted-foreground text-sm">{t("exportBody")}</p>
          <div>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => exportMyData({}), { onSuccess: download })}
            >
              {t("export")}
            </Button>
          </div>
        </div>
        <div className="grid gap-2 border-t pt-6">
          <div className="text-destructive text-sm font-medium">{t("deleteTitle")}</div>
          <p className="text-muted-foreground text-sm">{t("deleteBody")}</p>
          <div>
            <AlertDialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setPassword("");
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive">{t("delete")}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("confirmBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-2">
                  <Label htmlFor="delete-password">{t("password")}</Label>
                  <Input
                    id="delete-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
                  {/* A plain button: the dialog must stay open when the password is wrong. */}
                  <Button
                    variant="destructive"
                    disabled={deleting || !password}
                    onClick={deleteAccount}
                  >
                    {t("confirm")}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
