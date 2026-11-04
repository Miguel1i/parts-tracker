"use client";

import { Clock, LogIn, LogOut, Settings, Shield, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { signOut, useSession } from "@/lib/auth/client";

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

/**
 * Avatar menu: Profile & settings, Admin (active admins only) and Sign out; Sign in when
 * signed out. Hiding "Admin" is cosmetic: /admin and its actions check the role on the server.
 */
export function AccountMenu({ side = "bottom" }: { side?: "top" | "bottom" | "right" }) {
  const t = useTranslations("Account");
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const user = data?.user;

  if (!user) {
    const href =
      pathname === "/sign-in"
        ? "/sign-in"
        : { pathname: "/sign-in", query: pathname === "/" ? {} : { next: pathname } };
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("menu")} disabled={isPending}>
            <UserRound className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side={side} className="w-56">
          <DropdownMenuLabel className="text-muted-foreground font-normal">
            {t("signedOut")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={href}>
              <LogIn className="size-4" />
              {t("signIn")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const isAdmin = user.role === "admin" && user.status === "active";
  const isPendingApproval = user.status !== "active";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("menu")} className="rounded-full">
          <Avatar className="size-7">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback className="text-xs">{initials(user.name || user.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="text-muted-foreground truncate text-xs">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isPendingApproval && (
          <DropdownMenuItem asChild>
            <Link href="/pending">
              <Clock className="size-4" />
              {t("pending")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled>
          <Settings className="size-4" />
          {t("profile")}
          <span className="text-muted-foreground ml-auto text-xs">{t("soon")}</span>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield className="size-4" />
              {t("admin")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut className="size-4" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
