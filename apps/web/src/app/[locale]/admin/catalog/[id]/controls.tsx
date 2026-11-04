"use client";

import { Archive, ArchiveRestore, Check, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAdminAction } from "@/components/admin/use-admin-action";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { confirmIdentifier, removeIdentifier, setProductArchived } from "../actions";

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const t = useTranslations("Admin.catalog");
  const { pending, run } = useAdminAction();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(() => setProductArchived({ id, archived: !archived }), {
          success: archived ? t("unarchived") : t("archivedToast"),
        })
      }
    >
      {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      {archived ? t("unarchive") : t("archive")}
    </Button>
  );
}

export function IdentifierActions({
  id,
  confirmed,
  label,
}: {
  id: string;
  confirmed: boolean;
  label: string;
}) {
  const t = useTranslations("Admin.catalog");
  const tc = useTranslations("Admin.common");
  const { pending, run } = useAdminAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end gap-1">
      {!confirmed && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => confirmIdentifier({ id }), { success: t("identifierConfirmed") })
          }
        >
          <Check aria-hidden /> {tc("confirm")}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        aria-label={`${t("remove")} ${label}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden /> <span className="hidden sm:inline">{t("remove")}</span>
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeDescription", { value: label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                run(() => removeIdentifier({ id }), { success: t("identifierRemoved") })
              }
            >
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
