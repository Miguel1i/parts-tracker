"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { ActionErrorCode, ActionResult } from "@/lib/auth/guard";

/** Translates a Server Action's error code (Errors.*), with its `meta` values. */
export function useActionErrorText() {
  const t = useTranslations("Errors");
  return (code: ActionErrorCode, meta?: Record<string, string | number>) => {
    if (code === "rateLimited") {
      const minutes = Math.max(1, Math.ceil(Number(meta?.retryAfterSec ?? 60) / 60));
      return t("rateLimited", { minutes });
    }
    return t.has(code) ? t(code as "generic") : t("generic");
  };
}

/**
 * Runs an admin Server Action in a transition: toasts the error or `success`, then refreshes
 * the route so server-rendered lists pick up the change.
 */
export function useAdminAction() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const t = useTranslations("Admin.common");
  const errorText = useActionErrorText();

  function run<T>(
    action: () => Promise<ActionResult<T>>,
    opts: { success?: string; onSuccess?: (data: T) => void } = {},
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(errorText(result.error, result.meta));
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

/** The same runner for signed-in users' actions. */
export const useServerAction = useAdminAction;
