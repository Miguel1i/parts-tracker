import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth/guard";

// Session-dependent and admin-only: render on request (see ../layout.tsx).
export const instant = false;

export default async function AdminIndex() {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  await requireAdmin();
  redirect({ href: "/admin/users", locale });
}
