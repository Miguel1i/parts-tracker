import { Activity, Euro, PiggyBank, Store } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { initLocale } from "@/i18n/server";

const kpis = [
  { key: "buildTotal", icon: Euro },
  { key: "savings", icon: PiggyBank },
  { key: "merchants", icon: Store },
  { key: "lastRun", icon: Activity },
] as const;

export default async function DashboardPage() {
  await initLocale();
  const t = await getTranslations("Dashboard");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(({ key, icon: Icon }) => (
          <Card key={key}>
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Icon className="size-4 shrink-0" aria-hidden />
                {t(`kpi.${key}`)}
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">—</CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
      <EmptyState icon={Activity} title={t("empty.title")}>
        {t("empty.body")}
      </EmptyState>
    </>
  );
}
