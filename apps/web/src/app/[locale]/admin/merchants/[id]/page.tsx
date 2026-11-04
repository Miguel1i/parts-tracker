import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb, merchants, products } from "@parts/db";
import { and, asc, eq } from "@parts/db/orm";
import { PageHeader } from "@/components/empty-state";
import { routing } from "@/i18n/routing";
import { initLocale } from "@/i18n/server";
import { splitAdapterConfig } from "@/lib/admin/adapter-schema";
import { requireAdmin } from "@/lib/auth/guard";
import { MerchantForm } from "../merchant-form";
import { TestPanel } from "../test-panel";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Admin.merchants" });
  return { title: t("title") };
}

export default async function EditMerchantPage({
  params,
}: PageProps<"/[locale]/admin/merchants/[id]">) {
  await initLocale();
  await requireAdmin();
  const { id } = await params;
  const db = getDb();
  const [m] = await db.select().from(merchants).where(eq(merchants.id, id));
  if (!m) notFound();
  const testProducts = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.archived, false)))
    .orderBy(asc(products.name));
  const { fields, overrides } = splitAdapterConfig(m.adapterConfig);

  return (
    <div className="grid gap-8">
      <div>
        <PageHeader title={m.name} />
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
      <TestPanel merchantId={m.id} products={testProducts} />
    </div>
  );
}
