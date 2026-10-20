import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  CookingPot,
  Flame,
  MessageSquareText,
  ReceiptText,
  Settings,
  Store,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApprovalNotice } from "@/components/app/approval-notice";
import { Avatar } from "@/components/app/avatar";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Stars } from "@/components/app/rating";
import { SalesChart } from "@/components/app/sales-chart";
import { StoreStatusPill } from "@/components/app/store-status";
import { Card } from "@/components/ui/card";
import { percentChange, StatCard, Trend } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatPeso, formatTime, greeting, timeAgo, todayLabel } from "@/lib/format";
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
  bestSellers: { name: string; quantity: number; sales: number }[];
};

type Reviews = {
  rating: number | null;
  ratingCount: number;
  /** Count of 5, 4, 3, 2 and 1-star ratings */
  distribution: number[];
  reviews: { id: string; rating: number; comment: string | null; createdAt: string; resident: { name: string } }[];
};

export default function VendorOverviewPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorOverview />
    </Suspense>
  );
}

const sum = (days: SalesDay[]) => days.reduce((n, d) => n + d.sales, 0);

async function VendorOverview() {
  const user = await requireRole("VENDOR");
  const store = user.vendor!;
  const [stats, { days }, reviews] = await Promise.all([
    serverApi<Overview>("/vendor/overview"),
    serverApi<{ days: SalesDay[] }>("/vendor/sales?days=14"),
    serverApi<Reviews>("/vendor/reviews"),
  ]);
  const thisWeek = sum(days.slice(7));
  const lastWeek = sum(days.slice(0, 7));
  const topQuantity = stats.bestSellers[0]?.quantity ?? 0;

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
  const doneSteps = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        eyebrow={todayLabel()}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={`${store.name} · ${STORE_TYPE_LABEL[store.storeType]}`}
        actions={store.status === "APPROVED" && <StoreStatusPill store={store} />}
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

      {stats.pending > 0 && (
        <Link
          href="/vendor/orders"
          className="group mb-6 flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-4 text-white shadow-[0_12px_28px_-16px_rgba(210,70,0,0.8)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <span className="relative flex size-11 items-center justify-center rounded-xl bg-white/15">
            <ClipboardList className="size-5" aria-hidden />
            <span className="absolute -top-1 -right-1 flex size-3">
              <span className="absolute inset-0 animate-ping rounded-full bg-white opacity-75" />
              <span className="relative size-3 rounded-full border-2 border-brand-600 bg-white" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold">
              {stats.pending} new {stats.pending === 1 ? "order is" : "orders are"} waiting
            </span>
            <span className="block text-sm text-white/85">Accept them so the residents know you&apos;re cooking.</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700">
            Open orders <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      )}

      {doneSteps < steps.length && (
        <Card
          title="Set up your store"
          description={`${doneSteps} of ${steps.length} done. Finish these so residents can start ordering.`}
          className="mb-6"
          actions={
            <div className="h-2 w-40 overflow-hidden rounded-full bg-canvas" aria-hidden>
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(doneSteps / steps.length) * 100}%` }} />
            </div>
          }
        >
          <ul className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            {steps.map(({ href, Icon, title, text, done }) => (
              <li key={href}>
                <Link href={href} className="flex h-full items-start gap-3 px-5 py-4 transition hover:bg-canvas/60">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-600 text-white" : "bg-brand-50 text-brand-600"}`}
                  >
                    {done ? <Check className="size-4" strokeWidth={3} aria-label="Done" /> : <Icon className="size-4" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${done ? "text-muted line-through" : "text-ink"}`}>{title}</span>
                    <span className="block text-xs text-muted">{text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales today" value={formatPeso(stats.salesToday)} hint="Before delivery fees" Icon={Wallet} accent="brand" />
        <StatCard label="Orders today" value={stats.ordersToday} hint="Since midnight" Icon={ReceiptText} accent="sky" />
        <StatCard
          label="New orders"
          value={stats.pending}
          hint={stats.pending ? "Waiting for you to accept" : "Nothing waiting"}
          Icon={ClipboardList}
          highlight={stats.pending > 0}
          href="/vendor/orders"
        />
        <StatCard label="In the kitchen" value={stats.inKitchen} hint="Accepted or being prepared" Icon={CookingPot} accent="violet" href="/vendor/orders" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          title="Sales, last 14 days"
          description={<Trend change={percentChange(thisWeek, lastWeek)} label="this week vs last week" />}
          className="xl:col-span-2"
          actions={
            <div className="text-right">
              <p className="text-xl font-semibold text-ink tabular-nums">{formatPeso(sum(days))}</p>
              <p className="text-xs text-muted">{days.reduce((n, d) => n + d.orders, 0)} orders</p>
            </div>
          }
        >
          <div className="flex flex-1 flex-col justify-center px-5 pt-5 pb-4">
            <SalesChart days={days} />
          </div>
        </Card>

        <Card title="Ratings" description="What residents say about your food">
          {reviews.rating === null ? (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
              <MessageSquareText className="size-8 text-gray-300" aria-hidden />
              <p className="mt-3 text-sm text-muted">No ratings yet. They appear after residents receive their orders.</p>
            </div>
          ) : (
            <div className="px-5 py-4">
              <div className="flex items-center gap-5">
                <div className="text-center">
                  <p className="text-4xl font-bold tracking-tight text-ink">{reviews.rating.toFixed(1)}</p>
                  <Stars value={Math.round(reviews.rating)} size="size-3.5" />
                  <p className="mt-1 text-xs text-muted">
                    {reviews.ratingCount} {reviews.ratingCount === 1 ? "rating" : "ratings"}
                  </p>
                </div>
                <ul className="flex-1 space-y-1" aria-label="Ratings by stars">
                  {reviews.distribution.map((count, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-3 text-right font-medium text-muted">{5 - i}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${reviews.ratingCount ? (count / reviews.ratingCount) * 100 : 0}%` }} />
                      </div>
                      <span className="w-5 text-right text-muted tabular-nums">{count}</span>
                      <span className="sr-only">{count === 1 ? "rating" : "ratings"} with {5 - i} stars</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="mt-4 space-y-3 border-t border-line pt-4">
                {[...reviews.reviews]
                  .sort((a, b) => Number(Boolean(b.comment)) - Number(Boolean(a.comment)))
                  .slice(0, 2)
                  .map((review) => (
                    <li key={review.id} className="flex gap-3">
                      <Avatar name={review.resident.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-ink">{review.resident.name}</p>
                          <span className="shrink-0 text-xs text-gray-500">{timeAgo(review.createdAt)}</span>
                        </div>
                        <Stars value={review.rating} size="size-3" />
                        {review.comment && <p className="mt-1 line-clamp-2 text-sm text-ink">“{review.comment}”</p>}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <Card title="Best sellers" description="Most ordered dishes, last 14 days" Icon={Flame} className="xl:col-span-2">
          {stats.bestSellers.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">Your best sellers show up here after your first orders.</p>
          ) : (
            <ol className="divide-y divide-line">
              {stats.bestSellers.map((dish, i) => (
                <li key={dish.name} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-3 sm:grid-cols-[28px_minmax(0,1fr)_160px_96px]">
                  <span className={`text-sm font-bold tabular-nums ${i === 0 ? "text-brand-600" : "text-gray-400"}`}>{i + 1}</span>
                  <span className="truncate text-sm font-medium text-ink">{dish.name}</span>
                  <span className="hidden items-center gap-2 sm:flex">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(dish.quantity / topQuantity) * 100}%` }} />
                    </span>
                    <span className="w-12 text-right text-xs text-muted tabular-nums">{dish.quantity} sold</span>
                  </span>
                  <span className="text-right text-sm font-semibold text-ink tabular-nums">{formatPeso(dish.sales)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Your store" Icon={Store}>
          <ul className="divide-y divide-line">
            {[
              { href: "/vendor/menu", Icon: UtensilsCrossed, label: "Menu", detail: `${stats.dishes} ${stats.dishes === 1 ? "dish" : "dishes"}` },
              {
                href: "/vendor/reservations",
                Icon: CalendarDays,
                label: "Reservations",
                detail: store.acceptsReservations ? `${stats.upcomingBookings} upcoming ${stats.upcomingBookings === 1 ? "booking" : "bookings"}` : "Turned off",
              },
              { href: "/vendor/store", Icon: Settings, label: "Store settings", detail: `${formatTime(store.opensAt)} – ${formatTime(store.closesAt)}` },
            ].map(({ href, Icon, label, detail }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-canvas/60">
                  <Icon className="size-[18px] text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{label}</span>
                    <span className="block text-xs text-muted">{detail}</span>
                  </span>
                  <ChevronRight className="size-4 text-gray-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
