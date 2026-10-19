import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { LiveUpdates } from "./live-updates";
import { LogoutButton } from "./logout-button";
import { SidebarNav } from "./sidebar-nav";

/** Big-screen layout for vendors and admins: sidebar on the left, page on the right. */
export function DashboardShell({ role, children }: { role: "VENDOR" | "ADMIN"; children: ReactNode }) {
  return (
    <LiveUpdates>
      <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <SidebarNav
          role={role}
          footer={
            <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-gray-100" />}>
              <SidebarUser />
            </Suspense>
          }
        />
        <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </LiveUpdates>
  );
}

async function SidebarUser() {
  const user = await getCurrentUser();
  const subtitle = user.vendor?.name ?? (user.role === "ADMIN" ? "Administrator" : user.email);

  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
        <p className="truncate text-xs text-muted">{subtitle}</p>
      </div>
      <LogoutButton />
    </div>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
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
