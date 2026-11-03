import type messages from "../messages/en.json";
import type { routing } from "@/i18n/routing";

// Typed translation keys and locales across the app (en.json is the source of truth)
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
