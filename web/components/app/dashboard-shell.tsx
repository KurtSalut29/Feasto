import { CalendarDays, Coffee, KeyRound, Moon, ShieldCheck, Store, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { initials, mealTime, todayLabel, type MealTime } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { User } from "@/lib/types";
import { ChangePasswordButton } from "./change-password-dialog";
import { LiveUpdates } from "./live-updates";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { SidebarNav } from "./sidebar-nav";

type DashboardRole = "VENDOR" | "ADMIN";

/** Which sidebar links show a live count, and what the count means (read by screen readers). */
const COUNTED_LINKS: Record<DashboardRole, { href: string; meaning: string }[]> = {
  VENDOR: [{ href: "/vendor/orders", meaning: "new orders" }],
  ADMIN: [
    { href: "/admin/approvals", meaning: "waiting for review" },
    { href: "/admin/documents", meaning: "documents to check" },
    { href: "/admin/stuck", meaning: "stuck orders" },
  ],
};

/**
 * Big-screen layout for vendors and admins: a floating sidebar on the left, the page on the right.
 * The sidebar's server parts re-render on every live update, so the counts stay current.
 */
export function DashboardShell({ role, children }: { role: DashboardRole; children: ReactNode }) {
  return (
    <LiveUpdates>
      <div className="min-h-dvh bg-canvas">
        <SidebarNav
          role={role}
          context={
            <Suspense fallback={<div className="h-[60px] animate-pulse rounded-2xl bg-canvas" />}>
              <SidebarContext />
            </Suspense>
          }
          footer={
            <Suspense fallback={<div className="h-[52px] animate-pulse rounded-2xl bg-canvas" />}>
              <SidebarUser />
            </Suspense>
          }
          badges={Object.fromEntries(
            COUNTED_LINKS[role].map(({ href, meaning }) => [
              href,
              <Suspense key={href} fallback={null}>
                <NavCount role={role} href={href} meaning={meaning} />
              </Suspense>,
            ]),
          )}
        />
        {/* Phones: room at the bottom for the tabs. Big screens: room on the left for the sidebar. */}
        <main className="min-w-0 px-4 pt-5 pb-[calc(var(--tabbar-h)+2rem+env(safe-area-inset-bottom))] sm:px-6 lg:py-8 lg:pr-10 lg:pl-[312px] lg:transition-[padding] lg:duration-300 lg:collapsed:pl-[132px]">
          <div className="mx-auto max-w-6xl">
            {/* Big screens: today's date on the left, the bell on the right, above every page.
                On small screens the bell sits in the sidebar's top bar instead. */}
            <div data-print-hide className="relative z-20 mb-5 hidden h-11 items-center justify-between gap-4 lg:flex">
              <Suspense fallback={<span />}>
                <TodayLine />
              </Suspense>
              <NotificationBell variant="floating" allHref={role === "VENDOR" ? "/vendor/notifications" : "/admin/notifications"} />
            </div>
            {children}
          </div>
        </main>
      </div>
    </LiveUpdates>
  );
}

/** "Monday, November 9 · Dinner rush": the day and the part of it the kitchen is in, by Manila time */
async function TodayLine() {
  await getCurrentUser(); // reads the session, so the date is worked out per request
  const meal = mealTime();
  const { Icon, label } = MEAL_LABEL[meal];
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <CalendarDays className="size-4 text-gray-400" aria-hidden />
      <span className="font-semibold text-ink">{todayLabel()}</span>
      <span aria-hidden className="text-gray-300">
        ·
      </span>
      <Icon className="size-4 text-brand-600" aria-hidden />
      {label}
    </p>
  );
}

const MEAL_LABEL: Record<MealTime, { Icon: LucideIcon; label: string }> = {
  breakfast: { Icon: Sunrise, label: "Breakfast" },
  lunch: { Icon: Sun, label: "Lunch rush" },
  merienda: { Icon: Coffee, label: "Merienda" },
  dinner: { Icon: Sunset, label: "Dinner rush" },
  late: { Icon: Moon, label: "Late night" },
};

const STORE_STATE: Record<NonNullable<User["vendor"]>["status"], { label: string; dot: string }> = {
  APPROVED: { label: "Live for residents", dot: "bg-emerald-500" },
  PENDING: { label: "Waiting for approval", dot: "bg-amber-500" },
  REJECTED: { label: "Not approved", dot: "bg-red-500" },
  SUSPENDED: { label: "Suspended", dot: "bg-red-500" },
};

/** Card under the logo: the vendor's store and its state, or the admin console. */
async function SidebarContext() {
  const user = await getCurrentUser();
  const store = user.vendor;
  const state = store
    ? store.status === "APPROVED" && store.isTemporarilyClosed
      ? { label: "Temporarily closed", dot: "bg-gray-400" }
      : STORE_STATE[store.status]
    : { label: "All stores and riders", dot: "bg-brand-500" };

  return (
    <div
      title={store ? `${store.name}: ${state.label}` : "Admin console"}
      className="flex items-center gap-3 rounded-2xl border border-line/80 bg-canvas/70 p-2.5 lg:collapsed:justify-center lg:collapsed:border-transparent lg:collapsed:bg-transparent lg:collapsed:p-0"
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 text-brand-600">
        {store?.imageUrl ? (
          // A plain <img>: next/image here makes Next.js warn about Date.now() while it prerenders the dashboard
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.imageUrl} alt="" className="size-full object-cover" />
        ) : store ? (
          <Store className="size-5" aria-hidden />
        ) : (
          <ShieldCheck className="size-5" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1 lg:collapsed:sr-only">
        <p className="truncate text-sm font-semibold text-ink">{store?.name ?? "Admin console"}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${state.dot}`} />
          <span className="truncate">{state.label}</span>
        </p>
      </div>
    </div>
  );
}

/** The signed-in person at the bottom of the sidebar, with password and log out (vendor, admin and rider). Vendor and admin change the password in a pop-up. */
export async function SidebarUser() {
  const user = await getCurrentUser();

  return (
    <div className="flex items-center gap-3 rounded-2xl p-1.5 lg:collapsed:flex-col lg:collapsed:gap-1.5 lg:collapsed:p-0">
      <span
        title={user.name}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white"
      >
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1 lg:collapsed:sr-only">
        <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
      <div className="flex shrink-0 items-center lg:collapsed:flex-col lg:collapsed:gap-1.5">
        {user.role === "RIDER" ? (
          <Link
            href="/rider/password"
            aria-label="Change password"
            title="Change password"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <KeyRound className="size-[18px]" aria-hidden />
          </Link>
        ) : (
          <ChangePasswordButton email={user.email} variant="icon" />
        )}
        <LogoutButton />
      </div>
    </div>
  );
}

/** Things waiting for this person, by sidebar link: new orders for a vendor, what needs the admin. */
const waitingCounts = cache(async (role: DashboardRole): Promise<Record<string, number>> => {
  try {
    if (role === "VENDOR") return { "/vendor/orders": (await serverApi<{ pending: number }>("/vendor/overview")).pending };
    const stats = await serverApi<{ pendingStores: number; pendingRiders: number; renewals: number; expiredDocuments: number; stuckOrders: number }>("/admin/overview");
    return {
      "/admin/approvals": stats.pendingStores + stats.pendingRiders,
      "/admin/documents": stats.renewals + stats.expiredDocuments,
      "/admin/stuck": stats.stuckOrders,
    };
  } catch {
    return {}; // a missing count shouldn't break the whole dashboard
  }
});

/** Count pill on a sidebar link; becomes a dot when the sidebar is folded. */
async function NavCount({ role, href, meaning }: { role: DashboardRole; href: string; meaning: string }) {
  const count = (await waitingCounts(role))[href] ?? 0;
  if (count === 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white group-aria-[current=page]:bg-white group-aria-[current=page]:text-brand-700 lg:collapsed:absolute lg:collapsed:top-2 lg:collapsed:right-3 lg:collapsed:ml-0 lg:collapsed:size-2.5 lg:collapsed:min-w-0 lg:collapsed:p-0 lg:collapsed:ring-2 lg:collapsed:ring-white lg:collapsed:group-aria-[current=page]:ring-brand-600">
      <span className="lg:collapsed:sr-only">{count > 99 ? "99+" : count}</span>
      <span className="sr-only"> {meaning}</span>
    </span>
  );
}

/** Title row at the top of each dashboard page. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: ReactNode;
  /** Small line above the title, e.g. today's date */
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-wider text-brand-700 uppercase">{eyebrow}</p>}
        <h1 className="text-[26px] leading-tight font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** Placeholder while a dashboard page loads. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-gray-200" />
      <div className="mt-2 h-5 w-80 max-w-full animate-pulse rounded-lg bg-gray-200" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-200/70" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70 xl:col-span-2" />
        <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    </div>
  );
}
