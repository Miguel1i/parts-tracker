import { Gauge, LayoutGrid, Package, type LucideIcon } from "lucide-react";

// Public navigation only. Admin is reached from the account menu, for admins only.
export type NavItem = {
  href: "/" | "/compare" | "/builds";
  key: "dashboard" | "compare" | "builds";
  icon: LucideIcon;
};

export const mainNav: NavItem[] = [
  { href: "/", key: "dashboard", icon: Gauge },
  { href: "/compare", key: "compare", icon: LayoutGrid },
  { href: "/builds", key: "builds", icon: Package },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
