import { useTranslations } from "next-intl";
import { AccountMenu } from "@/components/account-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** No navigation here by design: nav lives in the sidebar only. */
export function TopBar() {
  const t = useTranslations("Nav");
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" label={t("toggleSidebar")} />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <LocaleSwitcher />
        <AccountMenu />
      </div>
    </header>
  );
}
