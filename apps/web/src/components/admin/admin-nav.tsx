"use client";

import {
  Activity,
  ClipboardCheck,
  History,
  Package,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type AdminSection = "users" | "merchants" | "catalog" | "review" | "runs" | "audit";

const sections: { key: AdminSection; icon: LucideIcon }[] = [
  { key: "users", icon: Users },
  { key: "merchants", icon: Store },
  { key: "catalog", icon: Package },
  { key: "review", icon: ClipboardCheck },
  { key: "runs", icon: Activity },
  { key: "audit", icon: History },
];

/**
 * The admin area's own section nav: underline tabs across the top (scrolling sideways on
 * phones), with mono counts for work waiting. Lives only inside /admin, never in the rail.
 */
export function AdminNav({ counts }: { counts: { pendingUsers: number; pendingReview: number } }) {
  const t = useTranslations("Admin.nav");
  const pathname = usePathname();
  const badge: Partial<Record<AdminSection, number>> = {
    users: counts.pendingUsers,
    review: counts.pendingReview,
  };

  return (
    <nav
      aria-label={t("label")}
      className="border-border -mx-4 overflow-x-auto border-b px-4 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0"
    >
      <ul className="flex gap-6">
        {sections.map(({ key, icon: Icon }) => {
          const href = `/admin/${key}` as const;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const n = badge[key] ?? 0;
          return (
            <li key={key} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:outline-ring -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2",
                  active
                    ? "border-primary text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span>{t(key)}</span>
                {n > 0 && (
                  <Badge
                    variant={key === "users" ? "signal" : "secondary"}
                    className="tabular-nums"
                    aria-label={t("pendingCount", { count: n })}
                  >
                    {n}
                  </Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
