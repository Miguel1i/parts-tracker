"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/client";

export function PendingActions() {
  const t = useTranslations("Auth.pending");
  const router = useRouter();
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => router.refresh()}>
        {t("check")}
      </Button>
      <Button
        variant="ghost"
        onClick={async () => {
          await signOut();
          router.push("/");
          router.refresh();
        }}
      >
        {t("signOut")}
      </Button>
    </div>
  );
}
