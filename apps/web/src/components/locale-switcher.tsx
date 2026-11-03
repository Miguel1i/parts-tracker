"use client";

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabels, routing } from "@/i18n/routing";

export function LocaleSwitcher({ side = "bottom" }: { side?: "top" | "bottom" | "right" }) {
  const t = useTranslations("Locale");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("change")} disabled={pending}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side}>
        {routing.locales.map((l) => (
          <DropdownMenuItem
            key={l}
            lang={l}
            onSelect={() => startTransition(() => router.replace(pathname, { locale: l }))}
          >
            {localeLabels[l]}
            {l === locale && <Check className="ml-auto size-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
