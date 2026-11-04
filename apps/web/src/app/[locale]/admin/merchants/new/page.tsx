import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/empty-state";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { emptyAdapterFields } from "@/lib/admin/adapter-schema";
import { adminMetadata, requireAdmin } from "@/lib/auth/guard";
import { MerchantForm } from "../merchant-form";

// Session-dependent and admin-only: render on request (see ../layout.tsx).
export const instant = false;

// Titles only for admins, so a 404 doesn't reveal what lives here.
export const generateMetadata = () => adminMetadata(metadata);

async function metadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Admin.merchants" });
  return { title: t("newTitle") };
}

export default async function NewMerchantPage() {
  await initLocale();
  await requireAdmin();
  const t = await getTranslations("Admin.merchants");
  return (
    <div>
      <PageHeader title={t("newTitle")} />
      <MerchantForm
        initial={{
          name: "",
          slug: "",
          country: "",
          baseUrl: "",
          searchTemplate: "",
          currency: "EUR",
          shipping: "0",
          freeShippingOver: "",
          enabled: true,
          visibleToUsers: true,
          ownOnly: false,
          needsBrowser: false,
          notes: "",
          color: "",
          adapter: emptyAdapterFields(),
          overrides: "",
        }}
      />
    </div>
  );
}
