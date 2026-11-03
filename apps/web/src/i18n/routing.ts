import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "pt-PT"],
  defaultLocale: "en",
  // English lives at "/", Portuguese at "/pt/..."
  localePrefix: { mode: "as-needed", prefixes: { "pt-PT": "/pt" } },
});

export type Locale = (typeof routing.locales)[number];

export const localeLabels: Record<Locale, string> = {
  en: "English",
  "pt-PT": "Português",
};
