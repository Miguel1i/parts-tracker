import { getDb, userPreferences } from "@parts/db";
import { eq } from "@parts/db/orm";
import { LayoutGrid, PackageOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CompareView } from "@/components/charts/compare-view";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/guard";
import { listBuilds } from "@/lib/builds/queries";
import { parseHide } from "@/lib/charts/compare";
import { loadCompare } from "@/lib/charts/compare-data";

// Reads the session at the top level: render on request.
export const instant = false;

export async function generateMetadata() {
  await initLocale();
  const t = await getTranslations("Compare");
  return { title: t("title") };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await initLocale();
  const user = await requireUser();
  const sp = await searchParams;
  const t = await getTranslations("Compare");
  const db = getDb();
  const builds = await listBuilds(db, user.id);

  const header = <PageHeader title={t("title")} description={t("description")} />;

  if (builds.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={LayoutGrid} title={t("noBuilds.title")}>
          <p>{t("noBuilds.body")}</p>
          <Button asChild className="mt-4">
            <Link href="/builds">{t("noBuilds.cta")}</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const requested = typeof sp.build === "string" ? sp.build : undefined;
  let build = builds[0]!;
  if (requested) {
    const found = builds.find((b) => b.id === requested);
    if (!found) notFound();
    build = found;
  } else {
    const [prefs] = await db
      .select({ id: userPreferences.defaultBuildId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id));
    build = builds.find((b) => b.id === prefs?.id) ?? build;
  }

  if (build.itemCount === 0) {
    return (
      <>
        {header}
        <EmptyState icon={PackageOpen} title={t("noItems.title")}>
          <p>{t("noItems.body")}</p>
          <Button asChild className="mt-4">
            <Link href={`/builds/${build.id}`}>{t("noItems.cta")}</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const data = await loadCompare(db, user.id, build.id);
  return (
    <>
      {header}
      <CompareView
        builds={builds.map((b) => ({ id: b.id, name: b.name }))}
        buildId={build.id}
        products={data.products}
        merchants={data.merchants}
        cells={data.cells}
        withShipping={data.withShipping}
        initialHidden={parseHide(
          sp.hide,
          data.merchants.map((m) => m.id),
        )}
        initialView={sp.view === "heatmap" ? "heatmap" : "grid"}
      />
    </>
  );
}
