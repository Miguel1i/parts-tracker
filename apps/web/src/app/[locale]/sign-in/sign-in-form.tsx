"use client";

import { Loader2, Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPathname, useRouter } from "@/i18n/navigation";
import { signIn, useSession } from "@/lib/auth/client";
import { safeNextPath } from "@/lib/auth/redirect";

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.23 1.5-1.7 4.4-5.35 4.4-3.22 0-5.85-2.67-5.85-5.95S8.78 6.5 12 6.5c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.96 14.55 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c5.2 0 8.64-3.65 8.64-8.8 0-.6-.07-1.05-.15-1.5z"
      />
    </svg>
  );
}

type Busy = "github" | "google" | "email" | null;

export function SignInForm({ providers }: { providers: { github: boolean; google: boolean } }) {
  const t = useTranslations("Auth.signIn");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const next = safeNextPath(params.get("next"));
  const invited = params.has("invite");

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [busy, setBusy] = useState<Busy>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    // Better Auth redirects back with ?error=<code> (validateUserInfo returns "invite_required").
    const code = params.get("error")?.toLowerCase();
    if (!code) return null;
    if (code.includes("invite")) return t("errors.invite_required");
    if (code.includes("ban")) return t("errors.banned");
    return t("errors.generic");
  });

  // Already signed in: go where they were heading.
  useEffect(() => {
    if (session?.user) router.replace(next);
  }, [session?.user, next, router]);

  // Better Auth redirects back to these paths, so they carry the locale prefix.
  const callbackURL = getPathname({ href: next, locale });
  const errorCallbackURL = getPathname({ href: "/sign-in", locale });
  // New accounts may need approval; /pending sends active ones straight to the dashboard.
  const newUserCallbackURL = getPathname({ href: "/pending", locale });

  async function social(provider: "github" | "google") {
    setBusy(provider);
    setError(null);
    const { error } = await signIn.social({
      provider,
      callbackURL,
      errorCallbackURL,
      newUserCallbackURL,
    });
    if (error) {
      setError(t("errors.generic"));
      setBusy(null);
    }
  }

  async function magic(e: React.FormEvent) {
    e.preventDefault();
    const to = email.trim();
    setBusy("email");
    setError(null);
    const { error } = await signIn.magicLink({
      email: to,
      callbackURL,
      newUserCallbackURL,
      errorCallbackURL,
    });
    setBusy(null);
    if (error) setError(t("errors.generic"));
    else setSentTo(to);
  }

  if (sentTo) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-sm">{t("sent", { email: sentTo })}</p>
        <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
          {t("useAnother")}
        </Button>
      </div>
    );
  }

  const anyProvider = providers.github || providers.google;

  return (
    <div className="space-y-4">
      {invited && <p className="bg-muted rounded-md p-3 text-sm">{t("invited")}</p>}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {anyProvider ? (
        <div className="grid gap-2">
          {providers.github && (
            <Button variant="outline" disabled={!!busy} onClick={() => social("github")}>
              {busy === "github" ? <Loader2 className="size-4 animate-spin" /> : <GithubIcon />}
              {t("github")}
            </Button>
          )}
          {providers.google && (
            <Button variant="outline" disabled={!!busy} onClick={() => social("google")}>
              {busy === "google" ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
              {t("google")}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{t("noProviders")}</p>
      )}
      <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
        <span className="bg-border h-px flex-1" />
        {t("or")}
        <span className="bg-border h-px flex-1" />
      </div>
      <form onSubmit={magic} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            placeholder={t("emailPlaceholder")}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={!!busy}>
          {busy === "email" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Mail className="size-4" />
          )}
          {busy === "email" ? t("sending") : t("sendLink")}
        </Button>
      </form>
    </div>
  );
}
