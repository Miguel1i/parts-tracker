"use client";

import { Cpu } from "lucide-react";
import { useTranslations } from "next-intl";
import { AccountMenu } from "@/components/account-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, mainNav } from "@/lib/nav";

export function AppSidebar() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const menuSide = isMobile ? "top" : "right";

  return (
    <Sidebar collapsible="icon" aria-label={t("main")}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Parts Tracker">
              <Link href="/" onClick={() => setOpenMobile(false)}>
                <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-md">
                  <Cpu className="size-4" aria-hidden />
                </span>
                <span className="font-semibold tracking-tight">Parts Tracker</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map(({ href, key, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive(pathname, href)} tooltip={t(key)}>
                    <Link
                      href={href}
                      onClick={() => setOpenMobile(false)}
                      aria-current={isActive(pathname, href) ? "page" : undefined}
                    >
                      <Icon aria-hidden />
                      <span>{t(key)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className={collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1"}>
          <AccountMenu side={menuSide} />
          <div className={collapsed ? "flex flex-col gap-1" : "ml-auto flex gap-1"}>
            <ThemeToggle side={menuSide} />
            <LocaleSwitcher side={menuSide} />
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail label={t("toggleSidebar")} />
    </Sidebar>
  );
}
