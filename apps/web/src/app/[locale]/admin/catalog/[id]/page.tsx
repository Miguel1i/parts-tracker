import { getDb, merchants, productIdentifiers, products } from "@parts/db";
import { asc, eq } from "@parts/db/orm";
import { ChevronLeft } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { isHttpUrl } from "@/lib/admin/review";
import { requireAdmin } from "@/lib/auth/guard";
import { ArchiveButton, IdentifierActions } from "./controls";

// Session-dependent and admin-only: render on request (see ../layout.tsx).
export const instant = false;

export default async function ProductPage({ params }: PageProps<"/[locale]/admin/catalog/[id]">) {
  await initLocale();
  await requireAdmin();
  const { id } = await params;
  const t = await getTranslations("Admin.catalog");
  const tc = await getTranslations("Admin.common");
  const format = await getFormatter();

  const db = getDb();
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) notFound();

  const identifiers = await db
    .select({
      id: productIdentifiers.id,
      kind: productIdentifiers.kind,
      value: productIdentifiers.value,
      source: productIdentifiers.source,
      confidence: productIdentifiers.confidence,
      confirmed: productIdentifiers.confirmed,
      sightings: productIdentifiers.sightings,
      merchantName: merchants.name,
    })
    .from(productIdentifiers)
    .leftJoin(merchants, eq(merchants.id, productIdentifiers.sourceMerchantId))
    .where(eq(productIdentifiers.productId, id))
    .orderBy(asc(productIdentifiers.kind), asc(productIdentifiers.value));

  const details: [string, string][] = [
    [t("category"), product.category ?? "–"],
    [t("brand"), product.brand ?? "–"],
    [t("refPrice"), product.refPrice != null ? format.number(product.refPrice, "price") : "–"],
    [t("query"), product.query],
  ];

  return (
    <div>
      <Link
        href="/admin/catalog"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> {t("title")}
      </Link>
      <PageHeader title={product.name} />

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        {isHttpUrl(product.imageUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="bg-muted size-24 shrink-0 rounded-lg object-contain"
          />
        )}
        <div className="min-w-0 flex-1">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
            {isHttpUrl(product.refUrl) && (
              <div className="contents">
                <dt className="text-muted-foreground">{t("refUrl")}</dt>
                <dd className="break-all">
                  <a
                    href={product.refUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {product.refUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {product.archived && <Badge variant="secondary">{t("archived")}</Badge>}
            <ArchiveButton id={product.id} archived={product.archived} />
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">{t("identifiers")}</h2>
      {identifiers.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noIdentifiers")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium">{t("kind")}</th>
                <th className="px-3 py-2 font-medium">{t("value")}</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">{t("source")}</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  {t("sourceMerchant")}
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">{t("confidence")}</th>
                <th className="px-3 py-2 font-medium">{t("confirmed")}</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">{t("sightings")}</th>
                <th className="px-3 py-2 text-right font-medium">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {identifiers.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2 uppercase">{i.kind}</td>
                  <td className="break-all px-3 py-2 font-mono">{i.value}</td>
                  <td className="hidden px-3 py-2 md:table-cell">{t(`sources.${i.source}`)}</td>
                  <td className="text-muted-foreground hidden px-3 py-2 md:table-cell">
                    {i.merchantName ?? "–"}
                  </td>
                  <td className="hidden px-3 py-2 tabular-nums md:table-cell">
                    {format.number(i.confidence, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2">
                    {i.confirmed ? (
                      <Badge>{tc("yes")}</Badge>
                    ) : (
                      <Badge variant="outline">{tc("no")}</Badge>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 tabular-nums md:table-cell">
                    {i.sightings.length}
                  </td>
                  <td className="px-3 py-2">
                    <IdentifierActions
                      id={i.id}
                      confirmed={i.confirmed && i.confidence >= 1}
                      label={`${i.kind.toUpperCase()} ${i.value}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
