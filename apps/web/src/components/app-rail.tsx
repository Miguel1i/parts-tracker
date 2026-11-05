"use client";

import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { AccountMenu } from "@/components/account-menu";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRail } from "@/hooks/use-rail";
import { Link, usePathname } from "@/i18n/navigation";
import { useAdminCounts } from "@/lib/admin-counts";
import { adminNav, inAdmin, isActive, mainNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/*
 * Collapsed styles use the `collapsed:` variant (globals.css), which only matches inside the
 * desktop rail, so the mobile drawer can reuse NavList unchanged.
 */

type Item = { href: string; label: string; icon: LucideIcon; count?: number; countLabel?: string };

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground collapsed:sr-only mb-2 px-3 font-mono text-[11px] uppercase tracking-[0.08em]">
      {children}
    </p>
  );
}

function NavItems({
  items,
  onNavigate,
  tooltips,
}: {
  items: Item[];
  onNavigate?: () => void;
  tooltips: boolean;
}) {
  const pathname = usePathname();
  return (
    <ul className="grid gap-0.5">
      {items.map(({ href, label, icon: Icon, count, countLabel }) => {
        const active = isActive(pathname, href);
        const link = (
          <Link
            // Typed routes: every href comes from lib/nav.ts.
            href={href as "/"}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group/nav relative flex h-10 items-center gap-3 rounded-[4px] px-3 text-[15px]",
              "transition-[background-color,color] duration-150 motion-reduce:transition-none",
              "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
              "collapsed:justify-center collapsed:px-0",
              active
                ? "bg-accent text-foreground font-semibold"
                : "text-foreground/75 hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {/* Active marker: a short signal bar that grows in. */}
            <span
              aria-hidden
              className={cn(
                "bg-primary absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-[2px] transition-[height] duration-200 motion-reduce:transition-none",
                active ? "h-5" : "h-0",
              )}
            />
            <Icon
              aria-hidden
              strokeWidth={active ? 2.25 : 1.75}
              className={cn(
                "size-[18px] shrink-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover/nav:text-foreground",
              )}
            />
            <span className="collapsed:sr-only truncate">{label}</span>
            {count != null && count > 0 && (
              <span
                aria-label={countLabel}
                className={cn(
                  "bg-primary text-primary-foreground ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-mono text-[11px] font-semibold tabular-nums",
                  "collapsed:absolute collapsed:right-1 collapsed:top-1 collapsed:ml-0 collapsed:h-4 collapsed:min-w-4 collapsed:px-1 collapsed:text-[10px]",
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
        return (
          <li key={href}>
            {tooltips ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Main sections, plus an Admin group while inside /admin (the area itself is gated). */
export function NavList({
  onNavigate,
  tooltips = false,
}: {
  onNavigate?: () => void;
  /** Show labels as tooltips (collapsed rail). */
  tooltips?: boolean;
}) {
  const t = useTranslations("Nav");
  const ta = useTranslations("Admin.nav");
  const pathname = usePathname();
  const counts = useAdminCounts();
  const admin = inAdmin(pathname);
  const badge = { users: counts?.pendingUsers, review: counts?.pendingReview } as Record<
    string,
    number | undefined
  >;

  return (
    <div className="grid gap-6">
      <div>
        <GroupLabel>{t("main")}</GroupLabel>
        <NavItems
          tooltips={tooltips}
          onNavigate={onNavigate}
          items={mainNav.map((i) => ({ href: i.href, label: t(i.key), icon: i.icon }))}
        />
      </div>
      {admin && (
        <div className="animate-page-in motion-reduce:animate-none">
          <GroupLabel>{t("admin")}</GroupLabel>
          <NavItems
            tooltips={tooltips}
            onNavigate={onNavigate}
            items={adminNav.map((i) => ({
              href: i.href,
              label: ta(i.key),
              icon: i.icon,
              count: badge[i.key],
              countLabel: badge[i.key] ? ta("pendingCount", { count: badge[i.key]! }) : undefined,
            }))}
          />
        </div>
      )}
    </div>
  );
}

/** Account, theme and language for the mobile drawer footer (desktop has them in the top bar). */
export function ShellControls({
  side,
  className,
}: {
  side: "top" | "bottom" | "right";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <AccountMenu side={side} />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle side={side} />
        <LocaleSwitcher side={side} />
      </div>
    </div>
  );
}

/** Desktop left rail (md and up): 240px, collapsible to a 64px icon rail. */
export function AppRail() {
  const t = useTranslations("Nav");
  const { collapsed, toggle } = useRail();

  return (
    <aside
      data-rail-root
      className={cn(
        "bg-background text-foreground sticky top-0 hidden h-svh w-[240px] shrink-0 flex-col border-r md:flex",
        "transition-[width] duration-200 motion-reduce:transition-none",
        "[html[data-rail=collapsed]_&]:w-16",
      )}
    >
      <div className="collapsed:justify-center collapsed:px-0 flex h-14 shrink-0 items-center border-b px-4">
        <Link
          href="/"
          aria-label={t("home")}
          className="focus-visible:outline-ring rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <Logo className="collapsed:hidden" />
          <LogoMark className="collapsed:block hidden size-7" />
        </Link>
      </div>

      <nav
        aria-label={t("main")}
        className="collapsed:px-2 flex-1 overflow-y-auto overflow-x-hidden px-3 py-5"
      >
        <NavList tooltips={collapsed} />
      </nav>

      <div className="shrink-0 border-t p-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("expand") : t("collapse")}
          className={cn(
            "text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-full items-center gap-2 rounded-[4px] px-2 font-mono text-[11px] uppercase tracking-[0.08em]",
            "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
            "collapsed:justify-center",
          )}
        >
          <PanelLeftClose aria-hidden className="collapsed:hidden size-4" />
          <PanelLeftOpen aria-hidden className="collapsed:block hidden size-4" />
          <span aria-hidden className="collapsed:hidden">
            {t("collapse")}
          </span>
        </button>
      </div>
    </aside>
  );
}
