import "server-only";
import { getTranslations } from "next-intl/server";

export type KickerSection =
  "dashboard" | "compare" | "builds" | "part" | "account" | "admin" | "share";

/** The mono kicker above a page title ("02 — Compare", "Admin"), from the Kickers messages. */
export async function kicker(section: KickerSection): Promise<string> {
  const t = await getTranslations("Kickers");
  return t(section);
}
