"use client";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useServerAction } from "@/components/admin/use-admin-action";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createBuild, deleteBuild, renameBuild } from "./actions";

function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initial,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  initial: string;
  pending: boolean;
  onSubmit: (name: string) => void;
}) {
  const t = useTranslations("Builds.nameDialog");
  const [name, setName] = useState(initial);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(initial);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSubmit(name.trim());
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="build-name">{t("name")}</Label>
            <Input
              id="build-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={t("placeholder")}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateBuildButton() {
  const t = useTranslations("Builds");
  const router = useRouter();
  const { pending, run } = useServerAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("new")}
      </Button>
      <NameDialog
        open={open}
        onOpenChange={setOpen}
        title={t("create.title")}
        description={t("create.description")}
        submitLabel={t("create.submit")}
        initial=""
        pending={pending}
        onSubmit={(name) =>
          run(() => createBuild({ name }), {
            onSuccess: (data) => {
              setOpen(false);
              router.push(`/builds/${data.id}`);
            },
          })
        }
      />
    </>
  );
}

/** Rename / delete for a build; after deleting, `redirectTo` is opened when given. */
export function BuildMenu({
  buildId,
  name,
  redirectOnDelete,
}: {
  buildId: string;
  name: string;
  redirectOnDelete?: boolean;
}) {
  const t = useTranslations("Builds");
  const router = useRouter();
  const { pending, run } = useServerAction();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("menu", { name })}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="size-4" />
            {t("rename.menu")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 className="size-4" />
            {t("delete.menu")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={t("rename.title")}
        submitLabel={t("rename.submit")}
        initial={name}
        pending={pending}
        onSubmit={(next) =>
          run(() => renameBuild({ buildId, name: next }), {
            success: t("rename.done"),
            onSuccess: () => setRenaming(false),
          })
        }
      />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title", { name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("nameDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteBuild({ buildId }), {
                  success: t("delete.done"),
                  onSuccess: () => {
                    setDeleting(false);
                    if (redirectOnDelete) router.replace("/builds");
                  },
                });
              }}
            >
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
