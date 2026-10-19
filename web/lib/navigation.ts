import {
  BarChart3,
  Bike,
  CalendarDays,
  ClipboardList,
  History,
  House,
  LayoutDashboard,
  Package,
  ReceiptText,
  Server,
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
    { href: "/resident/orders", label: "Orders", Icon: ReceiptText },
    { href: "/resident/bookings", label: "Bookings", Icon: CalendarDays },
    { href: "/resident/account", label: "Account", Icon: User, also: ["/resident/addresses", "/resident/profile"] },
  ],
  RIDER: [
    { href: "/rider", label: "Jobs", Icon: Package },
    { href: "/rider/active", label: "Active", Icon: Bike },
    { href: "/rider/history", label: "History", Icon: History },
    { href: "/rider/account", label: "Account", Icon: User, also: ["/rider/profile"] },
  ],
  VENDOR: [
    { href: "/vendor", label: "Overview", Icon: LayoutDashboard, group: "Today" },
    { href: "/vendor/orders", label: "Orders", Icon: ClipboardList, group: "Today" },
    { href: "/vendor/reservations", label: "Reservations", Icon: CalendarDays, group: "Today" },
    { href: "/vendor/menu", label: "Menu", Icon: UtensilsCrossed, group: "Your store" },
    { href: "/vendor/store", label: "Store settings", Icon: Store, group: "Your store" },
  ],
  ADMIN: [
    { href: "/admin", label: "Overview", Icon: LayoutDashboard, group: "Manage" },
    { href: "/admin/approvals", label: "Approvals", Icon: ShieldCheck, group: "Manage" },
    { href: "/admin/users", label: "Users", Icon: Users, group: "Manage" },
    { href: "/admin/orders", label: "Orders", Icon: ClipboardList, group: "Manage" },
    { href: "/admin/reports", label: "Reports", Icon: BarChart3, group: "Insights" },
    { href: "/admin/system", label: "System", Icon: Server, group: "Insights" },
  ],
};

const matches = (item: NavItem, pathname: string) =>
  [item.href, ...(item.also ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));

/**
 * Which item is active. The first item is the role's home: it's active on its own
 * page and on any page that doesn't belong to another item (e.g. a store's page).
 */
export function activeHref(items: NavItem[], pathname: string) {
  return items.slice(1).find((item) => matches(item, pathname))?.href ?? items[0].href;
}
