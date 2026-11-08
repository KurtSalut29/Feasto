import {
  BarChart3,
  Bike,
  CalendarDays,
  ClipboardList,
  FileClock,
  History,
  Hourglass,
  House,
  LayoutDashboard,
  Map as MapIcon,
  ReceiptText,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Store,
  User,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

/**
 * `also` lists other pages that belong to this tab (e.g. Addresses is part of Account).
 * `group` is the sidebar heading the link sits under (dashboard roles only).
 */
export type NavItem = { href: string; label: string; Icon: LucideIcon; also?: string[]; group?: string };

/** Bottom tabs for the mobile roles and sidebar links for the dashboard roles. */
export const NAVIGATION: Record<Role, NavItem[]> = {
  RESIDENT: [
    { href: "/resident", label: "Home", Icon: House },
    { href: "/resident/map", label: "Map", Icon: MapIcon },
    { href: "/resident/orders", label: "Orders", Icon: ReceiptText },
    { href: "/resident/bookings", label: "Bookings", Icon: CalendarDays },
    { href: "/resident/account", label: "Account", Icon: User, also: ["/resident/addresses", "/resident/profile", "/resident/password", "/resident/saved", "/resident/notifications"] },
  ],
  RIDER: [
    { href: "/rider", label: "Home", Icon: House },
    { href: "/rider/map", label: "Map", Icon: MapIcon },
    { href: "/rider/active", label: "Active", Icon: Bike },
    { href: "/rider/history", label: "History", Icon: History },
    { href: "/rider/account", label: "Account", Icon: User, also: ["/rider/profile", "/rider/license", "/rider/password"] },
  ],
  VENDOR: [
    { href: "/vendor", label: "Overview", Icon: LayoutDashboard, group: "Today" },
    { href: "/vendor/orders", label: "Orders", Icon: ClipboardList, group: "Today" },
    { href: "/vendor/reservations", label: "Reservations", Icon: CalendarDays, group: "Today" },
    { href: "/vendor/menu", label: "Menu", Icon: UtensilsCrossed, group: "Your store" },
    { href: "/vendor/riders", label: "Riders", Icon: Bike, group: "Your store" },
    { href: "/vendor/store", label: "Store settings", Icon: Store, group: "Your store" },
  ],
  ADMIN: [
    { href: "/admin", label: "Overview", Icon: LayoutDashboard, group: "Manage" },
    { href: "/admin/approvals", label: "Approvals", Icon: ShieldCheck, group: "Manage" },
    { href: "/admin/documents", label: "Documents", Icon: FileClock, group: "Manage" },
    { href: "/admin/stuck", label: "Stuck orders", Icon: Hourglass, group: "Manage" },
    { href: "/admin/orders", label: "Orders", Icon: ClipboardList, group: "Manage" },
    { href: "/admin/users", label: "Users", Icon: Users, group: "Manage" },
    { href: "/admin/reports", label: "Reports", Icon: BarChart3, group: "Insights" },
    { href: "/admin/activity", label: "Activity log", Icon: ScrollText, group: "Insights" },
    { href: "/admin/system", label: "System", Icon: Server, group: "Insights" },
    { href: "/admin/settings", label: "Settings", Icon: Settings, group: "Insights" },
  ],
};

const matches = (item: NavItem, pathname: string) =>
  [item.href, ...(item.also ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));

/**
 * Which item is active. The first item is the role's home: it's active on its own
 * page and on any page that doesn't belong to another item (e.g. a store's page).
 */
/** The bottom tabs show only on the main tab pages themselves; every other page has a back arrow instead. */
export function isTabPage(role: Role, pathname: string) {
  return NAVIGATION[role].some((item) => item.href === pathname);
}

/** Where Back goes when Feasto has no page to go back to, e.g. a link opened from a message. */
export function parentPage(role: Role, pathname: string) {
  const items = NAVIGATION[role];
  const owner = items.find((item) => item.also?.some((page) => pathname === page || pathname.startsWith(`${page}/`)));
  if (owner) return owner.href;
  if (pathname === "/resident/checkout") return "/resident/cart";
  const parent = pathname.replace(/\/[^/]+$/, "");
  return parent.split("/").length > 1 && parent ? parent : items[0].href;
}

/**
 * Pages Back should never return to from `pathname`, because they no longer make sense:
 * after an order is placed, the cart is empty and checkout has nothing left to pay for.
 */
export function isDeadEnd(pathname: string, target: string) {
  return pathname.startsWith("/resident/orders/") && (target === "/resident/cart" || target === "/resident/checkout");
}

export function activeHref(items: NavItem[], pathname: string) {
  return items.slice(1).find((item) => matches(item, pathname))?.href ?? items[0].href;
}
