import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb, merchants, products } from "@parts/db";
import { and, asc, eq } from "@parts/db/orm";
import { PageHeader } from "@/components/empty-state";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { splitAdapterConfig } from "@/lib/admin/adapter-schema";
import { loadMerchantHealth } from "@/lib/admin/health-data";
import { adminMetadata, requireAdmin } from "@/lib/auth/guard";
import { HealthChart } from "./health-chart";
import { MerchantForm } from "../merchant-form";
import { TestPanel } from "../test-panel";
import { kicker } from "@/lib/kicker";
import { BackLink } from "@/components/back-link";

// Session-dependent and admin-only: render on request (see ../layout.tsx).
export const instant = false;

// Titles only for admins, so a 404 doesn't reveal what lives here.
export const generateMetadata = () => adminMetadata(metadata);

async function metadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Admin.merchants" });
  return { title: t("title") };
}

export default async function EditMerchantPage({
  params,
}: PageProps<"/[locale]/admin/merchants/[id]">) {
  await initLocale();
  await requireAdmin();
  const t = await getTranslations("Admin.merchants");
  const { id } = await params;
  const db = getDb();
  const [m] = await db.select().from(merchants).where(eq(merchants.id, id));
  if (!m) notFound();
  const healthDays = await loadMerchantHealth(m.id);
  const testProducts = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.archived, false)))
    .orderBy(asc(products.name));
  const { fields, overrides } = splitAdapterConfig(m.adapterConfig);

  return (
    <div className="grid gap-8">
      <div>
        <BackLink href="/admin/merchants">{t("back")}</BackLink>
        <PageHeader kicker={await kicker("admin")} title={m.name} />
        <MerchantForm
          merchantId={m.id}
          merchantName={m.name}
          initial={{
            name: m.name,
            slug: m.slug,
            country: m.country ?? "",
            baseUrl: m.baseUrl,
            searchTemplate: m.searchTemplate,
            currency: m.currency,
            shipping: String(m.shipping),
            freeShippingOver: m.freeShippingOver == null ? "" : String(m.freeShippingOver),
            enabled: m.enabled,
            visibleToUsers: m.visibleToUsers,
            ownOnly: m.ownOnly,
            needsBrowser: m.needsBrowser,
            notes: m.notes ?? "",
            color: m.color ?? "",
            adapter: fields,
            overrides,
          }}
        />
      </div>
      <HealthChart days={healthDays} />
      <TestPanel merchantId={m.id} products={testProducts} />
    </div>
  );
}
