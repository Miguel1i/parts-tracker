"use client";

import { LogIn, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Signed-out placeholder. In milestone 5 this reads the session and shows the avatar, name,
 * "Profile & settings", "Admin" (role admin only) and "Sign out".
 */
export function AccountMenu({ side = "bottom" }: { side?: "top" | "bottom" | "right" }) {
  const t = useTranslations("Account");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("menu")}>
          <UserRound className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="w-56">
        <DropdownMenuLabel className="text-muted-foreground font-normal">
          {t("signedOut")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <LogIn className="size-4" />
          {t("signIn")}
          <span className="text-muted-foreground ml-auto text-xs">{t("soon")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
