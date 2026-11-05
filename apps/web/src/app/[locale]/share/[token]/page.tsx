import type { Metadata } from "next";
import { buildItems, getDb, merchants, productMerchant, products } from "@parts/db";
import { and, asc, eq, inArray, isNotNull } from "@parts/db/orm";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { initLocale } from "@/i18n/server";
import { publicBuildByToken } from "@/lib/builds/access";
import { kicker } from "@/lib/kicker";

// Reads the token param (and the DB) per request.
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/share/[token]">): Promise<Metadata> {
  await initLocale();
  const { token } = await params;
  const found = await publicBuildByToken(getDb(), token);
  if (!found) return { robots: { index: false, follow: false } };
  return { title: found.build.name, robots: { index: false, follow: false } };
}

export default async function SharedBuildPage({ params }: PageProps<"/[locale]/share/[token]">) {
  await initLocale();
  const { token } = await params;
  const db = getDb();
  const found = await publicBuildByToken(db, token);
  if (!found) notFound();
  const { build, ownerName } = found;
  const t = await getTranslations("Share");
  const format = await getFormatter();

  const items = await db
    .select({
      productId: buildItems.productId,
      name: products.name,
      quantity: buildItems.quantity,
      boughtAt: buildItems.boughtAt,
    })
    .from(buildItems)
    .innerJoin(products, eq(products.id, buildItems.productId))
    .where(eq(buildItems.buildId, build.id))
    .orderBy(asc(buildItems.sortOrder), asc(products.name));

  const productIds = items.map((i) => i.productId);
  const offers = productIds.length
    ? await db
        .select({
          productId: productMerchant.productId,
          price: productMerchant.lastPriceEur,
          merchantName: merchants.name,
          shipping: merchants.shipping,
          freeOver: merchants.freeShippingOver,
        })
        .from(productMerchant)
        .innerJoin(merchants, eq(merchants.id, productMerchant.merchantId))
        .where(
          and(
            inArray(productMerchant.productId, productIds),
            eq(productMerchant.lastStatus, "ok"),
            isNotNull(productMerchant.lastPriceEur),
            eq(productMerchant.enabled, true),
            eq(merchants.enabled, true),
            eq(merchants.visibleToUsers, true),
          ),
        )
    : [];

  const best = new Map<string, { merchantName: string; total: number }>();
  for (const o of offers) {
    if (o.price == null) continue;
    const ship = o.freeOver != null && o.freeOver <= o.price ? 0 : o.shipping;
    const total = o.price + ship;
    const cur = best.get(o.productId);
    if (!cur || total < cur.total) best.set(o.productId, { merchantName: o.merchantName, total });
  }

  const lines = items.map((i) => {
    const b = best.get(i.productId);
    return { ...i, best: b ?? null, line: b ? b.total * i.quantity : null };
  });
  const total = lines.reduce((sum, l) => sum + (l.line ?? 0), 0);
  const missing = lines.some((l) => l.line == null);

  return (
    <div>
      <PageHeader
        kicker={await kicker("share")}
        title={build.name}
        description={t("sharedBy", { name: ownerName })}
      />
      {lines.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-[6px] border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium">{t("product")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("quantity")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("price")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("lineTotal")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td className="px-3 py-2">
                    <span className="break-words font-medium">{l.name}</span>{" "}
                    {l.boughtAt && <Badge variant="secondary">{t("bought")}</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="px-3 py-2 text-right">
                    {l.best ? (
                      <>
                        <span className="tabular-nums">{format.number(l.best.total, "price")}</span>
                        <span className="text-muted-foreground block text-xs">
                          {l.best.merchantName}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t("noPrice")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.line != null ? format.number(l.line, "price") : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  {t("total")}
                  {missing && (
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      {t("partial")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {format.number(total, "price")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
