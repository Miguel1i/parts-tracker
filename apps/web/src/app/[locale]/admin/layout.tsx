import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { adminMetadata, requireAdmin } from "@/lib/auth/guard";
import { getAdminCounts } from "@/lib/admin/queries";
import { PublishAdminCounts } from "@/lib/admin-counts";

/*
 * The guard runs at the top of the layout, before anything streams, so non-admins get a real
 * 404 status (a notFound() inside Suspense would already have sent 200). Reading the session
 * there blocks the segment, which Cache Components only allows with `instant = false`.
 * Every admin page and Server Action re-checks on its own too: a layout doesn't guard pages
 * that render in parallel, nor POSTs to actions.
 */
export const instant = false;

// Titles only for admins, so a 404 doesn't reveal what lives here.
export const generateMetadata = () => adminMetadata(metadata);

async function metadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    robots: { index: false },
  };
}

export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  await initLocale();
  await requireAdmin();
  const counts = await getAdminCounts();

  return (
    <>
      {/* Section links live in the rail's Admin group; this feeds its badges. */}
      <PublishAdminCounts counts={counts} />
      {children}
    </>
  );
}
