import { Plus, Store } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getDb, merchants } from "@parts/db";
import { asc } from "@parts/db/orm";
import { MerchantsTable } from "./merchants-table";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await initLocale()) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Admin.merchants" });
  return { title: t("title") };
}

export default async function AdminMerchantsPage() {
  await initLocale();
  await requireAdmin();
  const t = await getTranslations("Admin.merchants");
  const rows = await getDb()
    .select({
      id: merchants.id,
      name: merchants.name,
      country: merchants.country,
      currency: merchants.currency,
      shipping: merchants.shipping,
      freeShippingOver: merchants.freeShippingOver,
      enabled: merchants.enabled,
      visibleToUsers: merchants.visibleToUsers,
      ownOnly: merchants.ownOnly,
      needsBrowser: merchants.needsBrowser,
      color: merchants.color,
      lastHealth: merchants.lastHealth,
      lastHealthAt: merchants.lastHealthAt,
    })
    .from(merchants)
    .orderBy(asc(merchants.sortOrder), asc(merchants.name));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("description")}</p>
        </div>
        <Button asChild>
          <Link href="/admin/merchants/new">
            <Plus aria-hidden />
            {t("new")}
          </Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Store} title={t("empty.title")}>
          {t("empty.body")}
        </EmptyState>
      ) : (
        <MerchantsTable rows={rows} />
      )}
    </div>
  );
}
