"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { approveCandidate, dismissReport, rejectCandidate } from "./actions";

export function DecisionButtons({ id, report = false }: { id: string; report?: boolean }) {
  const t = useTranslations("Admin.review");
  const { pending, run } = useAdminAction();
  if (report) {
    return (
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => dismissReport({ id }), { success: t("reports.dismissed") })}
        >
          <X aria-hidden /> {t("reports.dismiss")}
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => run(() => rejectCandidate({ id }), { success: t("reports.confirmed") })}
        >
          <Check aria-hidden /> {t("reports.confirm")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => run(() => rejectCandidate({ id }), { success: t("rejected") })}
      >
        <X aria-hidden /> {t("reject")}
      </Button>
      <Button
        disabled={pending}
        onClick={() => run(() => approveCandidate({ id }), { success: t("approved") })}
      >
        <Check aria-hidden /> {t("approve")}
      </Button>
    </div>
  );
}
