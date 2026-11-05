"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { AccountMenu } from "@/components/account-menu";
import { NavList, ShellControls } from "@/components/app-rail";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link, usePathname } from "@/i18n/navigation";
import { sectionFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

const iconButton = cn(
  "text-foreground hover:bg-accent grid size-9 place-items-center rounded-[4px] transition-colors motion-reduce:transition-none",
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
);

/**
 * A quiet breadcrumb in the desktop top bar ("Parts Tracker / Builds"). The page itself carries
 * the numbered kicker, so this doesn't repeat it.
 */
function SectionKicker() {
  const t = useTranslations("Nav");
  const ta = useTranslations("Account");
  const pathname = usePathname();
  const section = sectionFor(pathname);
  let label: string | null = null;
  if (section) label = t(section.key);
  else if (pathname === "/admin" || pathname.startsWith("/admin/")) label = t("admin");
  else if (pathname === "/account" || pathname.startsWith("/account/")) label = ta("profile");
  if (!label) return <span className="hidden md:block" />;
  return (
    <p className="text-muted-foreground hidden truncate text-sm md:block">
      <span>Parts Tracker</span>
      <span aria-hidden className="mx-2 opacity-50">
        /
      </span>
      <span className="text-foreground font-medium">{label}</span>
    </p>
  );
}

/** Mobile (< md): full-height drawer with the same nav and footer controls as the rail. */
function MobileMenu() {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={cn(iconButton, "-ml-2 md:hidden")} aria-label={t("openMenu")}>
        <Menu aria-hidden className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/40 motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "bg-background text-foreground fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col border-r shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)] outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left duration-200 motion-reduce:animate-none",
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <Dialog.Title className="sr-only">{t("menu")}</Dialog.Title>
            <Link href="/" onClick={close} aria-label={t("home")} className="rounded-[2px]">
              <Logo />
            </Link>
            <Dialog.Close className={cn(iconButton, "-mr-2")} aria-label={t("closeMenu")}>
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <nav aria-label={t("main")} className="flex-1 overflow-y-auto py-5 pr-4">
            <p className="text-muted-foreground mb-2 pl-4 font-mono text-[11px] uppercase tracking-[0.08em]">
              {t("main")}
            </p>
            <NavList onNavigate={close} />
          </nav>
          <div className="shrink-0 border-t p-3">
            <ShellControls side="top" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * No navigation here by design: nav lives in the rail (or its mobile drawer) only. Account,
 * theme and language sit on the right, as they do in the rail footer.
 */
export function TopBar() {
  const t = useTranslations("Nav");
  return (
    <header className="bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 md:px-8">
      <MobileMenu />
      <Link
        href="/"
        aria-label={t("home")}
        className="focus-visible:outline-ring min-w-0 rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-4 md:hidden"
      >
        <Logo />
      </Link>
      <SectionKicker />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <LocaleSwitcher />
        <AccountMenu />
      </div>
    </header>
  );
}
