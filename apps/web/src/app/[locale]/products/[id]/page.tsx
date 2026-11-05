import { getDb } from "@parts/db";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ProductHistoryChartLazy,
  ProductOffersChartLazy,
} from "@/components/charts/product-charts-lazy";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/guard";
import { bestOffers, priceWithShipping } from "@/lib/builds/queries";
import {
  loadBought,
  loadProductDiagnostics,
  loadProductHead,
  loadProductOffers,
} from "@/lib/charts/product-detail";
import { parseViewState } from "@/lib/charts/product-view";
import { ProductThumb } from "@/components/product-thumb";
import { kicker } from "@/lib/kicker";

// Reads the session at the top level: render on request.
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/products/[id]">): Promise<Metadata> {
  await initLocale();
  await requireUser();
  const { id } = await params;
  const head = await loadProductHead(getDb(), id);
  const t = await getTranslations("Product");
  return { title: head?.name ?? t("title") };
}

export default async function ProductPage({
  params,
  searchParams,
}: PageProps<"/[locale]/products/[id]">) {
  await initLocale();
  const user = await requireUser();
  const { id } = await params;
  const db = getDb();
  const head = await loadProductHead(db, id);
  if (!head) notFound();

  const t = await getTranslations("Product");
  const format = await getFormatter();
  const [best, offers, diagnostics, bought, withShipping, query] = await Promise.all([
    bestOffers(db, user.id, [id]),
    loadProductOffers(db, id, user.id),
    loadProductDiagnostics(db, id, user.id),
    loadBought(db, id, user.id),
    priceWithShipping(db, user.id),
    searchParams,
  ]);
  const offer = best.get(id);
  const vsRef =
    offer && head.refPrice ? ((offer.unitTotal - head.refPrice) / head.refPrice) * 100 : null;
  const when = (ts: number) =>
    format.dateTime(ts, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" });

  return (
    <>
      <Link
        href="/builds"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <div className="border-border mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end">
          <ProductThumb src={head.image} size="lg" />
          <div className="min-w-0">
            <p className="text-primary mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
              {await kicker("part")}
            </p>
            <h1 className="break-words text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] md:text-[40px]">
              {head.name}
            </h1>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
              {head.brand && <span>{head.brand}</span>}
              {head.category && <Badge variant="secondary">{head.category}</Badge>}
              {head.refUrl && (
                <a
                  href={head.refUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground inline-flex items-center gap-1 underline underline-offset-2"
                >
                  {t("referencePage")}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>
          </div>
        </div>
        <dl className="flex gap-6 text-right">
          <div>
            <dt className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.08em]">
              {t("bestPrice")}
            </dt>
            <dd className="font-mono text-[28px] font-semibold tabular-nums">
              {offer ? format.number(offer.unitTotal, "price") : "–"}
            </dd>
            <dd className="text-muted-foreground text-xs">
              {offer
                ? `${offer.merchantName} · ${withShipping ? t("withShipping") : t("withoutShipping")}`
                : t("noOffer")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.08em]">
              {t("refPrice")}
            </dt>
            <dd className="font-mono text-[28px] font-semibold tabular-nums">
              {head.refPrice != null ? format.number(head.refPrice, "price") : "–"}
            </dd>
            {vsRef != null && (
              <dd className="text-muted-foreground text-xs tabular-nums">
                {t(vsRef <= 0 ? "belowRef" : "aboveRef", {
                  pct: format.number(Math.abs(vsRef) / 100, "percent"),
                })}
              </dd>
            )}
          </div>
        </dl>
      </div>

      <div className="grid min-w-0 gap-8">
        <ProductHistoryChartLazy
          productId={head.id}
          productName={head.name}
          refPrice={head.refPrice}
          initial={parseViewState(query)}
          defaultShipping={withShipping}
          bought={bought}
          isAdmin={user.role === "admin"}
        />
        <ProductOffersChartLazy offers={offers} withShipping={withShipping} />

        <section aria-labelledby="diag-title" className="grid min-w-0 gap-3">
          <div>
            <h2 id="diag-title" className="text-base font-semibold">
              {t("diagnostics.title")}
            </h2>
            <p className="text-muted-foreground text-sm">{t("diagnostics.description")}</p>
          </div>
          {diagnostics.length === 0 ? (
            <p className="text-muted-foreground rounded-[6px] border border-dashed px-4 py-8 text-center text-sm">
              {t("diagnostics.empty")}
            </p>
          ) : (
            <ul className="grid gap-2">
              {diagnostics.map((d) => (
                <li
                  key={d.merchantId}
                  id={`diag-${d.merchantId}`}
                  className="min-w-0 scroll-mt-20 rounded-[6px] border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.merchantName}</span>
                    <Badge variant={d.status === "ok" ? "secondary" : "outline"}>
                      {t(`diagnostics.status.${d.status}`)}
                    </Badge>
                    <span className="text-muted-foreground text-xs">{when(d.at)}</span>
                  </div>
                  {d.message && <p className="mt-1 break-words text-sm">{d.message}</p>}
                  {d.log && (
                    <details className="mt-2">
                      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                        {t("diagnostics.showLog")}
                      </summary>
                      <pre
                        tabIndex={0}
                        className="bg-muted mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[4px] p-3 text-xs"
                      >
                        {d.log}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
