import {
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  CookingPot,
  MessageSquareText,
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
import { Stars } from "@/components/app/rating";
import { SalesChart } from "@/components/app/sales-chart";
import {
  DashboardSkeleton,
  PageHeader,
} from "@/components/app/dashboard-shell";
import { ApprovalBadge } from "@/components/app/status-badges";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatPeso, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { SalesDay } from "@/lib/types";

export const metadata: Metadata = { title: "Overview" };

type Overview = {
  ordersToday: number;
  salesToday: number;
  pending: number;
  inKitchen: number;
  dishes: number;
  tables: number;
  upcomingBookings: number;
  rating: number | null;
  ratingCount: number;
};

type Reviews = {
  rating: number | null;
  ratingCount: number;
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    resident: { name: string };
  }[];
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
  const [stats, { days }, reviews] = await Promise.all([
    serverApi<Overview>("/vendor/overview"),
    serverApi<{ days: SalesDay[] }>("/vendor/sales?days=14"),
    serverApi<Reviews>("/vendor/reviews"),
  ]);
  const periodSales = days.reduce((n, d) => n + d.sales, 0);
  const periodOrders = days.reduce((n, d) => n + d.orders, 0);

  const steps: {
    href: string;
    Icon: LucideIcon;
    title: string;
    text: string;
    done: boolean;
  }[] = [
    {
      href: "/vendor/menu",
      Icon: UtensilsCrossed,
      title: "Add your dishes",
      text: "Names, prices, photos and stock.",
      done: stats.dishes > 0,
    },
    {
      href: "/vendor/store",
      Icon: Store,
      title: "Complete your store details",
      text: "A cover photo and a short description.",
      done: Boolean(store.imageUrl && store.description),
    },
    ...(store.acceptsReservations
      ? [
          {
            href: "/vendor/reservations",
            Icon: CalendarDays,
            title: "Set up your tables",
            text: "So residents can book a table.",
            done: stats.tables > 0,
          },
        ]
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
        <StatCard
          label="New orders"
          value={stats.pending}
          hint="Waiting for you to accept"
          Icon={ClipboardList}
          highlight={stats.pending > 0}
        />
        <StatCard
          label="In the kitchen"
          value={stats.inKitchen}
          hint="Accepted or preparing"
          Icon={CookingPot}
        />
        <StatCard
          label="Orders today"
          value={stats.ordersToday}
          hint="Since midnight"
          Icon={ReceiptText}
        />
        <StatCard
          label="Sales today"
          value={formatPeso(stats.salesToday)}
          hint="Food only, before delivery fees"
          Icon={Wallet}
        />
      </div>

      {stats.pending > 0 && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <p className="font-medium text-ink">
              {stats.pending} new{" "}
              {stats.pending === 1 ? "order is" : "orders are"} waiting for you.
            </p>
            <ButtonLink href="/vendor/orders?tab=new">Open orders</ButtonLink>
          </div>
        </Card>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <Card
          title="Sales, last 14 days"
          description="Food sales per day, before delivery fees. Hover a bar for details."
          className="xl:col-span-2"
          actions={
            <div className="text-right">
              <p className="text-xl font-semibold text-ink">
                {formatPeso(periodSales)}
              </p>
              <p className="text-xs text-muted">{periodOrders} orders</p>
            </div>
          }
        >
          <div className="px-5 pt-6 pb-4">
            <SalesChart days={days} />
          </div>
        </Card>

        <Card title="Ratings" description="What residents say about your food.">
          <div className="px-5 py-4">
            {reviews.rating === null ? (
              <div className="flex items-center gap-3 py-6 text-sm text-muted">
                <MessageSquareText className="size-5 shrink-0" aria-hidden />
                No ratings yet. They appear after residents receive their
                orders.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <p className="text-4xl font-bold tracking-tight text-ink">
                    {reviews.rating.toFixed(1)}
                  </p>
                  <div>
                    <Stars value={Math.round(reviews.rating)} />
                    <p className="mt-0.5 text-sm text-muted">
                      {reviews.ratingCount}{" "}
                      {reviews.ratingCount === 1 ? "rating" : "ratings"}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-3 border-t border-line pt-4">
                  {[...reviews.reviews]
                    .sort(
                      (a, b) =>
                        Number(Boolean(b.comment)) - Number(Boolean(a.comment)),
                    )
                    .slice(0, 3)
                    .map((review) => (
                      <li key={review.id}>
                        <div className="flex items-center justify-between gap-2">
                          <Stars value={review.rating} size="size-3.5" />
                          <span className="text-xs text-gray-500">
                            {timeAgo(review.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-ink">
                          {review.comment ?? (
                            <span className="text-muted">No comment</span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {review.resident.name}
                        </p>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        </Card>
      </div>

      {!setupDone && (
        <Card
          title="Set up your store"
          description="Finish these so residents can start ordering."
          className="mt-6"
        >
          <ul className="divide-y divide-line">
            {steps.map(({ href, Icon, title, text, done }, index) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      done
                        ? "bg-emerald-600 text-white"
                        : "border border-line text-muted"
                    }`}
                  >
                    {done ? (
                      <Check
                        className="size-4"
                        strokeWidth={3}
                        aria-label="Done"
                      />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <Icon
                    className="size-5 shrink-0 text-brand-600"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block font-medium ${done ? "text-muted line-through" : "text-ink"}`}
                    >
                      {title}
                    </span>
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
              <span className="font-semibold">{stats.upcomingBookings}</span>{" "}
              upcoming table{" "}
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
