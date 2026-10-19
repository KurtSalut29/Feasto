import { ShieldCheck, Store } from "lucide-react";
import Image from "next/image";
import { cache, Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { User } from "@/lib/types";
import { LiveUpdates } from "./live-updates";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { SidebarNav } from "./sidebar-nav";

type DashboardRole = "VENDOR" | "ADMIN";

/** Which sidebar link shows a live count, and what the count means (read by screen readers). */
const COUNTED_LINK: Record<DashboardRole, { href: string; meaning: string }> = {
  VENDOR: { href: "/vendor/orders", meaning: "new orders" },
  ADMIN: { href: "/admin/approvals", meaning: "waiting for review" },
};

/**
 * Big-screen layout for vendors and admins: a floating sidebar on the left, the page on the right.
 * The sidebar's server parts re-render on every live update, so the counts stay current.
 */
export function DashboardShell({ role, children }: { role: DashboardRole; children: ReactNode }) {
  const counted = COUNTED_LINK[role];
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
          badges={{
            [counted.href]: (
              <Suspense fallback={null}>
                <NavCount role={role} meaning={counted.meaning} />
              </Suspense>
            ),
          }}
        />
        <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8 lg:pr-10 lg:pl-[312px] lg:transition-[padding] lg:duration-300 lg:collapsed:pl-[132px]">
          <div className="relative mx-auto max-w-6xl">
            {/* Level with the page title; on small screens the bell is in the top bar instead */}
            <div className="absolute top-0 right-0 z-20 hidden lg:block">
              <NotificationBell variant="floating" />
            </div>
            {children}
          </div>
        </main>
      </div>
    </LiveUpdates>
  );
}

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
          <Image src={store.imageUrl} alt="" fill unoptimized className="object-cover" />
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

/** The signed-in person, with the log out button. */
async function SidebarUser() {
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
      <LogoutButton />
    </div>
  );
}

/** Things waiting for this person: new orders for a vendor, sign-ups to review for an admin. */
const waitingCount = cache(async (role: DashboardRole): Promise<number> => {
  try {
    if (role === "VENDOR") return (await serverApi<{ pending: number }>("/vendor/overview")).pending;
    const stats = await serverApi<{ pendingStores: number; pendingRiders: number }>("/admin/overview");
    return stats.pendingStores + stats.pendingRiders;
  } catch {
    return 0; // a missing count shouldn't break the whole dashboard
  }
});

/** Count pill on a sidebar link; becomes a dot when the sidebar is folded. */
async function NavCount({ role, meaning }: { role: DashboardRole; meaning: string }) {
  const count = await waitingCount(role);
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
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    // Right padding keeps the actions clear of the notification bell in the corner
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:pr-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
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
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-200" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-2xl bg-gray-200" />
    </div>
  );
}
