import { Gauge, LayoutGrid, Package, type LucideIcon } from "lucide-react";

// Public navigation only. Admin is reached from the account menu, for admins only.
export type NavItem = {
  href: "/" | "/compare" | "/builds";
  key: "dashboard" | "compare" | "builds";
  /** Two-digit section number shown in mono before the label ("01 Dashboard"). */
  num: string;
  icon: LucideIcon;
};

export const mainNav: NavItem[] = [
  { href: "/", key: "dashboard", num: "01", icon: Gauge },
  { href: "/compare", key: "compare", num: "02", icon: LayoutGrid },
  { href: "/builds", key: "builds", num: "03", icon: Package },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav section a path belongs to (for the top-bar kicker), if any. */
export function sectionFor(pathname: string): NavItem | undefined {
  return mainNav.find((item) => isActive(pathname, item.href));
}
