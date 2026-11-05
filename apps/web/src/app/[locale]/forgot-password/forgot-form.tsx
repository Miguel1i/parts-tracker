"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset } from "@/lib/auth/client";

/**
 * Asks for a reset link. The answer is the same whether or not the email has an account, so
 * the form can't be used to find out who is registered.
 */
export function ForgotForm() {
  const t = useTranslations("Auth.forgot");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const { error } = await requestPasswordReset({
        email: email.trim(),
        redirectTo: `/${locale}/reset-password`,
      });
      if (error) setError(true);
      else setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="grid gap-4" role="status">
        <MailCheck className="text-primary size-6" aria-hidden />
        <p className="text-[15px] leading-6">{t("sent")}</p>
        <Link href="/sign-in" className="text-sm font-medium underline underline-offset-2">
          {t("back")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error && (
        <p
          role="alert"
          className="border-destructive text-destructive rounded-[4px] border-l-[3px] py-1 pl-3 text-sm"
        >
          {t("error")}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {t("submit")}
      </Button>
      <Link
        href="/sign-in"
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
      >
        {t("back")}
      </Link>
    </form>
  );
}
