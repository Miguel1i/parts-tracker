"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { AccountMenu } from "@/components/account-menu";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRail } from "@/hooks/use-rail";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, mainNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/*
 * Collapsed styles hang off `html[data-rail=collapsed] [data-rail-root]`, so only the desktop
 * rail reacts (the mobile drawer reuses NavList and never collapses). Tailwind needs literal
 * class names, hence the repeated arbitrary variant.
 */

/** Numbered section links: "01 Dashboard". Active = ink bar on the left + bold + aria-current. */
export function NavList({
  onNavigate,
  tooltips = false,
}: {
  onNavigate?: () => void;
  /** Show labels as tooltips (collapsed rail). */
  tooltips?: boolean;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  return (
    <ul className="grid gap-0.5">
      {mainNav.map(({ href, key, num, icon: Icon }) => {
        const active = isActive(pathname, href);
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group/nav relative flex h-10 items-center gap-3 rounded-r-[4px] pl-4 pr-3 text-[15px] transition-colors motion-reduce:transition-none",
              "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
              "hover:bg-accent [html[data-rail=collapsed]_[data-rail-root]_&]:justify-center [html[data-rail=collapsed]_[data-rail-root]_&]:px-0",
              active ? "text-foreground font-bold" : "text-foreground/80 hover:text-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "bg-foreground absolute inset-y-1.5 left-0 w-[3px]",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <span
              aria-hidden
              className={cn(
                "font-mono text-[11px] tabular-nums tracking-[0.04em] [html[data-rail=collapsed]_[data-rail-root]_&]:hidden",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {num}
            </span>
            <Icon
              aria-hidden
              className="hidden size-[18px] [html[data-rail=collapsed]_[data-rail-root]_&]:block"
            />
            <span className="truncate [html[data-rail=collapsed]_[data-rail-root]_&]:sr-only">
              {t(key)}
            </span>
          </Link>
        );
        return (
          <li key={href}>
            {tooltips ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{t(key)}</TooltipContent>
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

/** Account, theme and language: the rail footer and the drawer footer. */
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
      <div className="ml-auto flex items-center gap-1 [html[data-rail=collapsed]_[data-rail-root]_&]:ml-0 [html[data-rail=collapsed]_[data-rail-root]_&]:flex-col">
        <ThemeToggle side={side} />
        <LocaleSwitcher side={side} />
      </div>
    </div>
  );
}

/** Desktop left rail (md and up): 232px, collapsible to a 64px icon rail. */
export function AppRail() {
  const t = useTranslations("Nav");
  const { collapsed, toggle } = useRail();

  return (
    <aside
      data-rail-root
      className={cn(
        "bg-background text-foreground sticky top-0 hidden h-svh w-[232px] shrink-0 flex-col border-r md:flex",
        "transition-[width] duration-200 motion-reduce:transition-none",
        "[html[data-rail=collapsed]_&]:w-16",
      )}
    >
      <div className="flex h-14 shrink-0 items-center border-b px-4 [html[data-rail=collapsed]_[data-rail-root]_&]:justify-center [html[data-rail=collapsed]_[data-rail-root]_&]:px-0">
        <Link
          href="/"
          aria-label={t("home")}
          className="focus-visible:outline-ring rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <Logo className="[html[data-rail=collapsed]_[data-rail-root]_&]:hidden" />
          <LogoMark className="hidden size-7 [html[data-rail=collapsed]_[data-rail-root]_&]:block" />
        </Link>
      </div>

      <nav
        aria-label={t("main")}
        className="flex-1 overflow-y-auto py-5 pr-3 [html[data-rail=collapsed]_[data-rail-root]_&]:px-2"
      >
        <p className="text-muted-foreground mb-2 pl-4 font-mono text-[11px] uppercase tracking-[0.08em] [html[data-rail=collapsed]_[data-rail-root]_&]:sr-only">
          {t("main")}
        </p>
        <NavList tooltips={collapsed} />
      </nav>

      <div className="grid shrink-0 gap-2 border-t p-3">
        <ShellControls
          side="right"
          className="[html[data-rail=collapsed]_[data-rail-root]_&]:flex-col"
        />
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("expand") : t("collapse")}
          className={cn(
            "text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 items-center gap-2 rounded-[4px] px-2 font-mono text-[11px] uppercase tracking-[0.08em]",
            "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
            "[html[data-rail=collapsed]_[data-rail-root]_&]:justify-center",
          )}
        >
          <PanelLeftClose
            aria-hidden
            className="size-4 [html[data-rail=collapsed]_[data-rail-root]_&]:hidden"
          />
          <PanelLeftOpen
            aria-hidden
            className="hidden size-4 [html[data-rail=collapsed]_[data-rail-root]_&]:block"
          />
          <span aria-hidden className="[html[data-rail=collapsed]_[data-rail-root]_&]:hidden">
            {t("collapse")}
          </span>
        </button>
      </div>
    </aside>
  );
}
