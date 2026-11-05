"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const options = ["light", "dark", "system"] as const;

export function ThemeToggle({ side = "bottom" }: { side?: "top" | "bottom" | "right" }) {
  const t = useTranslations("Theme");
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("change")} className="relative">
          <Sun
            aria-hidden
            className="size-4 transition-transform motion-reduce:transition-none dark:scale-0"
          />
          <Moon
            aria-hidden
            className="absolute size-4 scale-0 transition-transform motion-reduce:transition-none dark:scale-100"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="min-w-40">
        <DropdownMenuLabel>{t("change")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {options.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
