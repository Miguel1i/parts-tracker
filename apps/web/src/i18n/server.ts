import { locale as rootLocale } from "next/root-params";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "./routing";

/**
 * Reads the [locale] root param (no `await params`, so navigations stay instant under
 * Cache Components) and registers it with next-intl for static rendering.
 * Returns null for an unknown locale so callers can notFound().
 */
export async function initLocale(): Promise<Locale | null> {
  const value = await rootLocale();
  if (!hasLocale(routing.locales, value)) return null;
  setRequestLocale(value);
  return value;
}
