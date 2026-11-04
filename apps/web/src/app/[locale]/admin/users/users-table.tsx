"use client";

import {
  Ban,
  Check,
  LogOut,
  MoreHorizontal,
  Package,
  Pencil,
  Shield,
  ShieldOff,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveUser,
  banUser,
  removeUser,
  revokeUserSessions,
  setUserRole,
  unbanUser,
  updateUserName,
} from "./actions";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "admin" | "user";
  status: "active" | "pending";
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  createdAt: Date;
  isSelf: boolean;
  builds: { id: string; name: string; isPublic: boolean; createdAt: Date }[];
};

type DialogState =
  | { kind: "name"; user: UserRow }
  | { kind: "ban"; user: UserRow }
  | { kind: "delete"; user: UserRow }
  | { kind: "builds"; user: UserRow }
  | null;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const t = useTranslations("Admin.users");
  const format = useFormatter();
  const { pending, run } = useAdminAction();
  const [dialog, setDialog] = useState<DialogState>(null);

  if (users.length === 0) {
    return <EmptyState icon={Users} title={t("empty")} />;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.user")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("columns.builds")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("columns.joined")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="min-w-48 max-w-0 sm:max-w-none">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      {u.image && <AvatarImage src={u.image} alt="" />}
                      <AvatarFallback className="text-xs">
                        {initials(u.name || u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {u.name}
                        {u.isSelf && (
                          <span className="text-muted-foreground ml-1 text-xs">({t("you")})</span>
                        )}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">{u.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.role === "admin" && <Badge>{t("roles.admin")}</Badge>}
                    {u.banned ? (
                      <Badge variant="destructive" title={u.banReason ?? undefined}>
                        {t("status.banned")}
                      </Badge>
                    ) : u.status === "pending" ? (
                      <Badge variant="outline">{t("status.pending")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("status.active")}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Button
                    variant="link"
                    className="h-auto p-0"
                    disabled={u.builds.length === 0}
                    onClick={() => setDialog({ kind: "builds", user: u })}
                  >
                    {t("buildCount", { count: u.builds.length })}
                  </Button>
                </TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                  {format.dateTime(u.createdAt, { dateStyle: "medium" })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("actionsFor", { name: u.name })}
                        disabled={pending}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {u.status === "pending" && (
                        <DropdownMenuItem
                          onSelect={() =>
                            run(() => approveUser({ userId: u.id }), {
                              success: t("done.approved"),
                            })
                          }
                        >
                          <Check className="size-4" />
                          {t("actions.approve")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "name", user: u })}>
                        <Pencil className="size-4" />
                        {t("actions.editName")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="md:hidden"
                        disabled={u.builds.length === 0}
                        onSelect={() => setDialog({ kind: "builds", user: u })}
                      >
                        <Package className="size-4" />
                        {t("buildCount", { count: u.builds.length })}
                      </DropdownMenuItem>
                      {!u.isSelf && (
                        <DropdownMenuItem
                          onSelect={() =>
                            run(
                              () =>
                                setUserRole({
                                  userId: u.id,
                                  role: u.role === "admin" ? "user" : "admin",
                                }),
                              { success: t("done.role") },
                            )
                          }
                        >
                          {u.role === "admin" ? (
                            <ShieldOff className="size-4" />
                          ) : (
                            <Shield className="size-4" />
                          )}
                          {u.role === "admin" ? t("actions.makeUser") : t("actions.makeAdmin")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() =>
                          run(() => revokeUserSessions({ userId: u.id }), {
                            success: t("done.revoked"),
                          })
                        }
                      >
                        <LogOut className="size-4" />
                        {t("actions.revokeSessions")}
                      </DropdownMenuItem>
                      {!u.isSelf && (
                        <>
                          <DropdownMenuSeparator />
                          {u.banned ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                run(() => unbanUser({ userId: u.id }), {
                                  success: t("done.unbanned"),
                                })
                              }
                            >
                              <Undo2 className="size-4" />
                              {t("actions.unban")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setDialog({ kind: "ban", user: u })}>
                              <Ban className="size-4" />
                              {t("actions.ban")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDialog({ kind: "delete", user: u })}
                          >
                            <Trash2 className="size-4" />
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NameDialog state={dialog} onClose={() => setDialog(null)} />
      <BanDialog state={dialog} onClose={() => setDialog(null)} />
      <DeleteDialog state={dialog} onClose={() => setDialog(null)} />
      <BuildsDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

function NameDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const t = useTranslations("Admin.users");
  const tc = useTranslations("Admin.common");
  const { pending, run } = useAdminAction();
  const open = state?.kind === "name";
  const [name, setName] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (open && state.user.id !== lastId) {
    setLastId(state.user.id);
    setName(state.user.name);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!open) return;
            run(() => updateUserName({ userId: state.user.id, name }), {
              success: tc("saved"),
              onSuccess: onClose,
            });
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t("actions.editName")}</DialogTitle>
            <DialogDescription>{open && state.user.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="user-name">{t("fields.name")}</Label>
            <Input
              id="user-name"
              value={name}
              required
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BanDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const t = useTranslations("Admin.users");
  const tc = useTranslations("Admin.common");
  const { pending, run } = useAdminAction();
  const open = state?.kind === "ban";
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setDays("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!open) return;
            const n = Number(days);
            run(
              () =>
                banUser({
                  userId: state.user.id,
                  reason: reason.trim() || undefined,
                  days: days && n > 0 ? Math.round(n) : undefined,
                }),
              { success: t("done.banned"), onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("ban.title", { name: open ? state.user.name : "" })}</DialogTitle>
            <DialogDescription>{t("ban.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="ban-reason">{t("ban.reason")}</Label>
            <Input
              id="ban-reason"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ban-days">{t("ban.days")}</Label>
            <Input
              id="ban-days"
              type="number"
              min={1}
              max={3650}
              inputMode="numeric"
              value={days}
              placeholder={t("ban.permanent")}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {t("actions.ban")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const t = useTranslations("Admin.users");
  const tc = useTranslations("Admin.common");
  const { pending, run } = useAdminAction();
  const open = state?.kind === "delete";
  const [confirm, setConfirm] = useState("");
  const matches = open && confirm.trim().toLowerCase() === state.user.email.toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setConfirm("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!open || !matches) return;
            run(() => removeUser({ userId: state.user.id, confirmEmail: confirm }), {
              success: t("done.deleted"),
              onSuccess: () => {
                setConfirm("");
                onClose();
              },
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("delete.title", { name: open ? state.user.name : "" })}</DialogTitle>
            <DialogDescription>{t("delete.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="delete-confirm">
              {t("delete.typeEmail", { email: open ? state.user.email : "" })}
            </Label>
            <Input
              id="delete-confirm"
              value={confirm}
              autoComplete="off"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || !matches}>
              {t("actions.delete")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BuildsDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const t = useTranslations("Admin.users");
  const format = useFormatter();
  const open = state?.kind === "builds";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("builds.title", { name: open ? state.user.name : "" })}</DialogTitle>
          <DialogDescription>{t("builds.description")}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {open &&
            state.user.builds.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {b.isPublic && <Badge variant="secondary">{t("builds.public")}</Badge>}
                <span className="text-muted-foreground text-xs">
                  {format.dateTime(b.createdAt, { dateStyle: "medium" })}
                </span>
              </li>
            ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
