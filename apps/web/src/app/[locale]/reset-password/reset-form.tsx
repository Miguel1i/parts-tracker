"use client";

import { CircleCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { resetPassword } from "@/lib/auth/client";

type ResetError = "mismatch" | "expired" | "generic";

export function ResetForm() {
  const t = useTranslations("Auth.reset");
  const params = useSearchParams();
  const token = params.get("token");
  const invalid = !token || params.get("error") === "INVALID_TOKEN";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ResetError | null>(null);

  if (invalid) {
    return (
      <div className="grid gap-4">
        <p role="alert" className="text-[15px] leading-6">
          {t("invalid")}
        </p>
        <Link href="/forgot-password" className="text-sm font-medium underline underline-offset-2">
          {t("again")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid gap-4" role="status">
        <CircleCheck className="text-success size-6" aria-hidden />
        <p className="text-[15px] leading-6">{t("done")}</p>
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("mismatch");
    setBusy(true);
    setError(null);
    try {
      const { error } = await resetPassword({ newPassword: password, token: token! });
      if (!error) return setDone(true);
      const raw = `${error.code ?? ""} ${error.message ?? ""}`;
      setError(/token/i.test(raw) ? "expired" : "generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error && (
        <p
          role="alert"
          className="border-destructive text-destructive rounded-[4px] border-l-[3px] py-1 pl-3 text-sm"
        >
          {t(`errors.${error}`)}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="new-password">{t("new")}</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="new-password-help"
        />
        <p id="new-password-help" className="text-muted-foreground text-xs">
          {t("help")}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-password">{t("confirm")}</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {t("submit")}
      </Button>
    </form>
  );
}
