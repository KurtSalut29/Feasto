import {
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  CookingPot,
  ReceiptText,
  Store,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApprovalNotice } from "@/components/app/approval-notice";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { ApprovalBadge } from "@/components/app/status-badges";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";

export const metadata: Metadata = { title: "Overview" };

type Overview = {
  ordersToday: number;
  salesToday: number;
  pending: number;
  inKitchen: number;
  dishes: number;
  tables: number;
  upcomingBookings: number;
};

export default function VendorOverviewPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorOverview />
    </Suspense>
  );
}

async function VendorOverview() {
  const user = await requireRole("VENDOR");
  const store = user.vendor!;
  const stats = await serverApi<Overview>("/vendor/overview");

  const steps: { href: string; Icon: LucideIcon; title: string; text: string; done: boolean }[] = [
    { href: "/vendor/menu", Icon: UtensilsCrossed, title: "Add your dishes", text: "Names, prices, photos and stock.", done: stats.dishes > 0 },
    {
      href: "/vendor/store",
      Icon: Store,
      title: "Complete your store details",
      text: "A cover photo and a short description.",
      done: Boolean(store.imageUrl && store.description),
    },
    ...(store.acceptsReservations
      ? [{ href: "/vendor/reservations", Icon: CalendarDays, title: "Set up your tables", text: "So residents can book a table.", done: stats.tables > 0 }]
      : []),
  ];
  const setupDone = steps.every((s) => s.done);

  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description={`${store.name} · ${STORE_TYPE_LABEL[store.storeType]}`}
        actions={<ApprovalBadge status={store.status} />}
      />

      {store.status !== "APPROVED" && (
        <div className="mb-6">
          <ApprovalNotice
            status={store.status}
            reviewNote={store.reviewNote}
            pendingText={`An admin will review ${store.name} soon. You can prepare your menu in the meantime; residents will see your store once it's approved.`}
            blockedText={`Residents can't see ${store.name} right now. Please contact the Feasto admin.`}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New orders" value={stats.pending} hint="Waiting for you to accept" Icon={ClipboardList} highlight={stats.pending > 0} />
        <StatCard label="In the kitchen" value={stats.inKitchen} hint="Accepted or preparing" Icon={CookingPot} />
        <StatCard label="Orders today" value={stats.ordersToday} hint="Since midnight" Icon={ReceiptText} />
        <StatCard label="Sales today" value={formatPeso(stats.salesToday)} hint="Food only, before delivery fees" Icon={Wallet} />
      </div>

      {stats.pending > 0 && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <p className="font-medium text-ink">
              {stats.pending} new {stats.pending === 1 ? "order is" : "orders are"} waiting for you.
            </p>
            <ButtonLink href="/vendor/orders?tab=new">Open orders</ButtonLink>
          </div>
        </Card>
      )}

      {!setupDone && (
        <Card title="Set up your store" description="Finish these so residents can start ordering." className="mt-6">
          <ul className="divide-y divide-line">
            {steps.map(({ href, Icon, title, text, done }, index) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      done ? "bg-emerald-600 text-white" : "border border-line text-muted"
                    }`}
                  >
                    {done ? <Check className="size-4" strokeWidth={3} aria-label="Done" /> : index + 1}
                  </span>
                  <Icon className="size-5 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block font-medium ${done ? "text-muted line-through" : "text-ink"}`}>{title}</span>
                    <span className="block text-sm text-muted">{text}</span>
                  </span>
                  <ChevronRight className="size-5 text-gray-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {store.acceptsReservations && stats.tables > 0 && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <p className="text-ink">
              <span className="font-semibold">{stats.upcomingBookings}</span> upcoming table{" "}
              {stats.upcomingBookings === 1 ? "booking" : "bookings"}
            </p>
            <ButtonLink href="/vendor/reservations" variant="secondary">
              See reservations
            </ButtonLink>
          </div>
        </Card>
      )}
    </>
  );
}
