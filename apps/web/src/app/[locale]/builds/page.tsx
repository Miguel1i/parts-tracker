import { getDb } from "@parts/db";
import { Globe, Package } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { initLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/guard";
import { listBuilds } from "@/lib/builds/queries";
import { BuildMenu, CreateBuildButton } from "./build-menu";

// Reads the session at the top level: render on request.
export const instant = false;

export async function generateMetadata() {
  await initLocale();
  const t = await getTranslations("Builds");
  return { title: t("title") };
}

export default async function BuildsPage() {
  await initLocale();
  const user = await requireUser();
  const t = await getTranslations("Builds");
  const format = await getFormatter();
  const list = await listBuilds(getDb(), user.id);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("description")}</p>
        </div>
        <CreateBuildButton />
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Package} title={t("empty.title")}>
          {t("empty.body")}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((b) => (
            <li key={b.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start gap-2">
                    <Link
                      href={`/builds/${b.id}`}
                      className="min-w-0 flex-1 break-words text-base font-semibold hover:underline"
                    >
                      {b.name}
                    </Link>
                    <BuildMenu buildId={b.id} name={b.name} />
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                    <span>{t("count", { count: b.itemCount })}</span>
                    {b.isPublic && (
                      <Badge variant="secondary">
                        <Globe className="size-3" />
                        {t("public")}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-auto">
                    <p className="text-2xl font-semibold tabular-nums">
                      {format.number(b.total, "price")}
                    </p>
                    {b.missingPrice > 0 && (
                      <p className="text-muted-foreground text-xs">
                        {t("missing", { count: b.missingPrice })}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
