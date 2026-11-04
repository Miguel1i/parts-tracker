"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/auth/guard";

/**
 * Runs an admin Server Action in a transition: toasts the error or `success`, then refreshes
 * the route so server-rendered lists pick up the change.
 */
export function useAdminAction() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const t = useTranslations("Admin.common");

  function run<T>(
    action: () => Promise<ActionResult<T>>,
    opts: { success?: string; onSuccess?: (data: T) => void } = {},
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        if (opts.success) toast.success(opts.success);
        opts.onSuccess?.(result.data);
        router.refresh();
      } catch {
        toast.error(t("error"));
      }
    });
  }

  return { pending, run };
}
