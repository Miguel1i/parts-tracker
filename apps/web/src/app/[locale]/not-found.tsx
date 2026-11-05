import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <EmptyState kicker="404" title={t("title")}>
      <p>{t("body")}</p>
      <Button asChild variant="outline" className="mt-4">
        <Link href="/">{t("back")}</Link>
      </Button>
    </EmptyState>
  );
}
