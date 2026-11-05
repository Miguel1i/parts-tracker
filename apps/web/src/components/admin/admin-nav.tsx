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
 * The admin area's own section nav: a vertical list on desktop, a horizontally scrolling tab
 * row on mobile. Lives only inside /admin, never in the main sidebar.
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
      className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 xl:mx-0 xl:w-52 xl:shrink-0 xl:overflow-visible xl:px-0"
    >
      <ul className="flex gap-1 xl:sticky xl:top-20 xl:flex-col">
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
                  "hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-[3px]",
                  active ? "bg-muted text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span>{t(key)}</span>
                {n > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-auto tabular-nums"
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
