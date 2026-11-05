import {
  Activity,
  LayoutDashboard,
  ListChecks,
  PackageSearch,
  PcCase,
  Scale,
  ScrollText,
  Store,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: "/" | "/compare" | "/builds";
  key: "dashboard" | "compare" | "builds";
  icon: LucideIcon;
};

export const mainNav: NavItem[] = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/compare", key: "compare", icon: Scale },
  { href: "/builds", key: "builds", icon: PcCase },
];

export type AdminSection = "users" | "merchants" | "catalog" | "review" | "runs" | "audit";

/** Admin sections: shown as a second rail group, only while inside /admin (which is gated). */
export const adminNav: { key: AdminSection; href: `/admin/${AdminSection}`; icon: LucideIcon }[] = [
  { key: "users", href: "/admin/users", icon: UsersRound },
  { key: "merchants", href: "/admin/merchants", icon: Store },
  { key: "catalog", href: "/admin/catalog", icon: PackageSearch },
  { key: "review", href: "/admin/review", icon: ListChecks },
  { key: "runs", href: "/admin/runs", icon: Activity },
  { key: "audit", href: "/admin/audit", icon: ScrollText },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function inAdmin(pathname: string) {
  return isActive(pathname, "/admin");
}

/** The nav section a path belongs to (for the top-bar breadcrumb), if any. */
export function sectionFor(pathname: string): NavItem | undefined {
  return mainNav.find((item) => isActive(pathname, item.href));
}
