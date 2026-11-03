"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const options = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

export function ThemeToggle({ side = "bottom" }: { side?: "top" | "bottom" | "right" }) {
  const t = useTranslations("Theme");
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("change")}>
          <Sun className="size-4 rotate-0 scale-100 transition-transform motion-reduce:transition-none dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-transform motion-reduce:transition-none dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side}>
        {options.map(({ value, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon className="size-4" />
            {t(value)}
            {theme === value && <Check className="ml-auto size-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
