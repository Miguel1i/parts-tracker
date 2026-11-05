"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useServerAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabels, routing, type Locale } from "@/i18n/routing";
import { savePreferences, setMerchants } from "./actions";

const NONE = "__none__";
type Theme = "light" | "dark" | "system";

export function PreferencesSection({
  preferences,
  builds,
  merchants,
}: {
  preferences: {
    locale: string | null;
    theme: Theme | null;
    defaultBuildId: string | null;
    priceWithShipping: boolean;
  };
  builds: { id: string; name: string }[];
  merchants: { id: string; name: string; enabled: boolean }[];
}) {
  const t = useTranslations("Account.settings.preferences");
  const currentLocale = useLocale() as Locale;
  const { theme: currentTheme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const prefs = useServerAction();
  const merch = useServerAction();

  const [locale, setLocale] = useState<Locale>(
    routing.locales.includes(preferences.locale as Locale)
      ? (preferences.locale as Locale)
      : currentLocale,
  );
  const [theme, setThemeValue] = useState<Theme>(
    preferences.theme ?? ((currentTheme as Theme | undefined) || "system"),
  );
  const [buildId, setBuildId] = useState(preferences.defaultBuildId ?? NONE);
  const [withShipping, setWithShipping] = useState(preferences.priceWithShipping);
  const [enabled, setEnabled] = useState(
    () => new Set(merchants.filter((m) => m.enabled).map((m) => m.id)),
  );

  function toggle(id: string, on: boolean) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            prefs.run(
              () =>
                savePreferences({
                  locale,
                  theme,
                  defaultBuildId: buildId === NONE ? null : buildId,
                  priceWithShipping: withShipping,
                }),
              {
                success: t("saved"),
                onSuccess: (saved) => {
                  setTheme(saved.theme);
                  if (saved.locale !== currentLocale) {
                    router.replace(pathname, { locale: saved.locale });
                  }
                },
              },
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pref-locale">{t("language")}</Label>
              <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                <SelectTrigger id="pref-locale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {routing.locales.map((l) => (
                    <SelectItem key={l} value={l} lang={l}>
                      {localeLabels[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pref-theme">{t("theme")}</Label>
              <Select value={theme} onValueChange={(v) => setThemeValue(v as Theme)}>
                <SelectTrigger id="pref-theme" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t("themeLight")}</SelectItem>
                  <SelectItem value="dark">{t("themeDark")}</SelectItem>
                  <SelectItem value="system">{t("themeSystem")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pref-build">{t("defaultBuild")}</Label>
            <Select value={buildId} onValueChange={setBuildId}>
              <SelectTrigger id="pref-build" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("noDefaultBuild")}</SelectItem>
                {builds.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-[4px] border p-3">
            <div className="min-w-0">
              <Label htmlFor="pref-shipping">{t("withShipping")}</Label>
              <p className="text-muted-foreground mt-1 text-xs">{t("withShippingHint")}</p>
            </div>
            <Switch id="pref-shipping" checked={withShipping} onCheckedChange={setWithShipping} />
          </div>
          <div>
            <Button type="submit" disabled={prefs.pending}>
              {t("save")}
            </Button>
          </div>
        </form>

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            merch.run(() => setMerchants({ enabledMerchantIds: [...enabled] }), {
              success: t("merchantsSaved"),
            });
          }}
        >
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">{t("merchants")}</legend>
            <p className="text-muted-foreground text-xs">{t("merchantsHint")}</p>
            {merchants.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noMerchants")}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {merchants.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`merchant-${m.id}`}
                      checked={enabled.has(m.id)}
                      onCheckedChange={(v) => toggle(m.id, v === true)}
                    />
                    <Label htmlFor={`merchant-${m.id}`} className="min-w-0 truncate">
                      {m.name}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <div>
            <Button type="submit" variant="outline" disabled={merch.pending || !merchants.length}>
              {t("saveMerchants")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
