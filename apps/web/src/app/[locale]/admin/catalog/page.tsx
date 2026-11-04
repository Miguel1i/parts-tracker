import { getDb, productIdentifiers, products } from "@parts/db";
import { and, desc, eq, inArray, sql } from "@parts/db/orm";
import { Package, Search } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth/guard";

const LIMIT = 200;

export default async function CatalogPage({ searchParams }: PageProps<"/[locale]/admin/catalog">) {
  await initLocale();
  await requireAdmin();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const archived = sp.archived === "1";
  const t = await getTranslations("Admin.catalog");
  const tc = await getTranslations("Admin.common");
  const format = await getFormatter();

  const db = getDb();
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const filters = [
    archived ? undefined : eq(products.archived, false),
    q ? sql`${products.name} like ${`%${escaped}%`} escape '\\'` : undefined,
  ].filter((f) => f !== undefined);
  const rows = await db
    .select()
    .from(products)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(products.createdAt))
    .limit(LIMIT);

  const idRows = rows.length
    ? await db
        .select({
          productId: productIdentifiers.productId,
          confirmed: productIdentifiers.confirmed,
        })
        .from(productIdentifiers)
        .where(
          inArray(
            productIdentifiers.productId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  const stats = new Map<string, { total: number; unconfirmed: number }>();
  for (const r of idRows) {
    const s = stats.get(r.productId) ?? { total: 0, unconfirmed: 0 };
    s.total++;
    if (!r.confirmed) s.unconfirmed++;
    stats.set(r.productId, s);
  }

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />
      <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={tc("search")}
          className="w-full sm:w-72"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={archived}
            className="accent-primary size-4"
          />
          {t("showArchived")}
        </label>
        <Button type="submit">
          <Search aria-hidden /> {tc("search")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Package} title={t("empty")}>
          {tc("noResults")}
        </EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("category")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("brand")}</TableHead>
                <TableHead className="text-right">{t("refPrice")}</TableHead>
                <TableHead>{t("identifiers")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const s = stats.get(p.id) ?? { total: 0, unconfirmed: 0 };
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[16rem] whitespace-normal">
                      <Link href={`/admin/catalog/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.archived && (
                        <Badge variant="secondary" className="ml-2">
                          {t("archived")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {p.category ?? "–"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {p.brand ?? "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.refPrice != null ? format.number(p.refPrice, "price") : "–"}
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">{s.total}</span>
                      {s.unconfirmed > 0 && (
                        <Badge variant="outline" className="ml-2">
                          {t("unconfirmedCount", { count: s.unconfirmed })}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length === LIMIT && (
            <p className="text-muted-foreground mt-3 text-sm">{t("limited", { count: LIMIT })}</p>
          )}
        </>
      )}
    </div>
  );
}
