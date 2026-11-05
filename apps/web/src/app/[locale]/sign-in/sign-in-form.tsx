"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { signIn, signUp, useSession } from "@/lib/auth/client";
import { safeNextPath } from "@/lib/auth/redirect";
import { cn } from "@/lib/utils";

type Mode = "signIn" | "signUp";
type ErrorKey =
  | "badCredentials"
  | "taken"
  | "usernameTaken"
  | "invite_required"
  | "banned"
  | "password"
  | "username";

/** Better Auth error codes → message keys under Auth.signIn.errors. */
const ERROR_KEYS: Record<string, ErrorKey> = {
  INVALID_EMAIL_OR_PASSWORD: "badCredentials",
  INVALID_USERNAME_OR_PASSWORD: "badCredentials",
  INVALID_PASSWORD: "badCredentials",
  USER_NOT_FOUND: "badCredentials",
  USER_ALREADY_EXISTS: "taken",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "taken",
  USERNAME_IS_ALREADY_TAKEN: "usernameTaken",
  USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER: "usernameTaken",
  INVALID_USERNAME: "username",
  USERNAME_TOO_SHORT: "username",
  USERNAME_TOO_LONG: "username",
  PASSWORD_TOO_SHORT: "password",
  PASSWORD_TOO_LONG: "password",
  BANNED_USER: "banned",
  INVITE_REQUIRED: "invite_required",
};

export function SignInForm() {
  const t = useTranslations("Auth.signIn");
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const next = safeNextPath(params.get("next"));
  const inviteToken = params.get("invite") ?? undefined;

  const [mode, setMode] = useState<Mode>(
    inviteToken || params.get("mode") === "signup" ? "signUp" : "signIn",
  );
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in: go where they were heading (or wait for approval).
  useEffect(() => {
    if (session?.user) router.replace(session.user.status === "active" ? next : "/pending");
  }, [session?.user, next, router]);

  function showError(e: { code?: string; message?: string } | null | undefined) {
    const raw = (e?.code ?? e?.message ?? "").toUpperCase().replace(/[^A-Z]+/g, "_");
    const key: ErrorKey | null =
      ERROR_KEYS[raw] ??
      (raw.includes("INVITE") ? "invite_required" : raw.includes("BAN") ? "banned" : null);
    setError(key ? t(`errors.${key}`) : t("errors.generic"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let status: string | undefined;
      if (mode === "signIn") {
        const id = login.trim();
        const { data, error } = id.includes("@")
          ? await signIn.email({ email: id, password })
          : await signIn.username({ username: id, password });
        if (error) return showError(error);
        status = (data?.user as { status?: string } | undefined)?.status;
      } else {
        const name = username.trim();
        // `inviteToken` isn't a user field: the server's signup hooks read it from the request.
        const body = {
          email: email.trim(),
          password,
          name,
          username: name,
          ...(inviteToken ? { inviteToken } : {}),
        } as Parameters<typeof signUp.email>[0];
        const { data, error } = await signUp.email(body);
        if (error) return showError(error);
        status = (data?.user as { status?: string } | undefined)?.status;
      }
      router.replace(status === "active" ? next : "/pending");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: Mode) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => {
        setMode(m);
        setError(null);
      }}
      className={cn(
        "focus-visible:outline-ring -mb-px flex-1 border-b-2 px-1 pb-2.5 pt-1 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none",
        mode === m
          ? "border-primary text-foreground font-semibold"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {m === "signIn" ? t("tabSignIn") : t("tabSignUp")}
    </button>
  );

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-4 border-b">
        {tab("signIn")}
        {tab("signUp")}
      </div>
      {inviteToken && mode === "signUp" && (
        <p className="border-primary bg-muted rounded-[4px] border-l-[3px] p-3 text-sm">
          {t("invited")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="border-destructive text-destructive rounded-[4px] border-l-[3px] py-1 pl-3 text-sm"
        >
          {error}
        </p>
      )}
      <form onSubmit={submit} className="grid gap-4">
        {mode === "signIn" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="login">{t("login")}</Label>
            <Input
              id="login"
              autoComplete="username"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_.]{3,30}"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-describedby="username-help"
              />
              <p id="username-help" className="text-muted-foreground text-xs">
                {t("usernameHelp")}
              </p>
            </div>
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
          </>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            required
            minLength={mode === "signUp" ? 8 : undefined}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={mode === "signUp" ? "password-help" : undefined}
          />
          {mode === "signUp" && (
            <p id="password-help" className="text-muted-foreground text-xs">
              {t("passwordHelp")}
            </p>
          )}
        </div>
        <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {mode === "signIn" ? t("submitSignIn") : t("submitSignUp")}
        </Button>
        {mode === "signIn" && <p className="text-muted-foreground text-xs">{t("forgot")}</p>}
      </form>
    </div>
  );
}
