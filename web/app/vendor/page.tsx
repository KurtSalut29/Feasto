import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  CookingPot,
  Flame,
  ListOrdered,
  MessageSquareText,
  ReceiptText,
  Star,
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
import { DashboardSkeleton } from "@/components/app/dashboard-shell";
import { ExpiryNotice } from "@/components/app/expiry-notice";
import { Stars } from "@/components/app/rating";
import { SalesChart } from "@/components/app/sales-chart";
import { VerificationForm } from "@/components/app/verification-form";
import { Card, CARD_LINK } from "@/components/ui/card";
import { percentChange, Trend } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatPeso, renderTime, timeAgo } from "@/lib/format";
import { itemsSummary, orderCode, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { SalesDay, VendorOrder } from "@/lib/types";
import type { Verification } from "@/lib/verification-fields";
import { stageOf } from "./orders/queue";
import { WaitClock } from "./orders/wait-clock";
import { VendorHero } from "./vendor-hero";

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
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    resident: { name: string };
  }[];
};

/** How many orders the queue card shows; the Orders page has the rest */
const IN_QUEUE_CARD = 5;

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
  const [stats, { days }, reviews, { orders: queue }] = await Promise.all([
    serverApi<Overview>("/vendor/overview"),
    serverApi<{ days: SalesDay[] }>("/vendor/sales?days=14"),
    serverApi<Reviews>("/vendor/reviews"),
    serverApi<{ orders: VendorOrder[] }>("/vendor/orders?tab=active"),
  ]);
  const verification = store.status === "PENDING" || store.status === "REJECTED" ? await serverApi<Verification>("/documents/verification") : null;
  const thisWeek = sum(days.slice(7));
  const lastWeek = sum(days.slice(0, 7));
  const topQuantity = stats.bestSellers[0]?.quantity ?? 0;
  const renderedAt = renderTime();
  const readyCount = queue.filter((o) => o.status === "READY" || o.status === "PICKED_UP").length;

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
      <VendorHero
        firstName={user.name.split(" ")[0]}
        storeType={STORE_TYPE_LABEL[store.storeType]}
        store={store}
        live={store.status === "APPROVED"}
        dishes={stats.dishes}
        bookings={stats.upcomingBookings}
      />

      {store.status !== "APPROVED" && (
        <div className="mb-5">
          <ApprovalNotice
            status={store.status}
            reviewNote={store.reviewNote}
            pendingText={`An admin will review ${store.name} soon. You can prepare your menu in the meantime; residents will see your store once it's approved.`}
            blockedText={`Residents can't see ${store.name} right now. Please contact the Feasto admin.`}
          />
          {verification && (
            <div className="mt-4">
              <VerificationForm role="VENDOR" data={verification} />
            </div>
          )}
        </div>
      )}

      {(store.status === "APPROVED" || store.status === "SUSPENDED") && (
        <ExpiryNotice
          date={store.permitExpiresAt}
          documentName="business permit"
          href="/vendor/store#permit"
          blocked="The admin may suspend your store until your renewed permit is approved. Click to send it."
        />
      )}

      {doneSteps < steps.length && (
        <Card
          title="Set up your store"
          description={`${doneSteps} of ${steps.length} done. Finish these so residents can start ordering.`}
          className="mb-5"
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

      {/* Today in four numbers. The two that ask for work open the queue. */}
      <section aria-label="Today" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure Icon={Wallet} label="Sales today" value={formatPeso(stats.salesToday)} hint="Food only, before delivery fees" />
        <Figure Icon={ReceiptText} label="Orders today" value={String(stats.ordersToday)} hint="Since midnight" />
        <Figure
          Icon={ClipboardList}
          label="New orders"
          value={String(stats.pending)}
          hint={stats.pending ? "Waiting for you to accept" : "Nothing waiting"}
          href="/vendor/orders?stage=new"
          alert={stats.pending > 0}
        />
        <Figure
          Icon={CookingPot}
          label="In the kitchen"
          value={String(stats.inKitchen)}
          hint={readyCount ? `${readyCount} more ready or on the way` : "Being prepared"}
          href="/vendor/orders?stage=kitchen"
        />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <Card
          title="Order queue"
          description="First come, first served. The oldest order is on top."
          Icon={ListOrdered}
          className="xl:col-span-2"
          actions={
            <Link
              href="/vendor/orders"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Open orders
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
          footer={
            queue.length > IN_QUEUE_CARD && (
              <Link href="/vendor/orders" className={CARD_LINK}>
                {queue.length - IN_QUEUE_CARD} more in the queue
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )
          }
        >
          {queue.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <ClipboardList className="size-8 text-gray-300" aria-hidden />
              <p className="mt-3 font-semibold text-ink">No orders right now</p>
              <p className="mt-1 text-sm text-muted">New orders appear here instantly, with a sound.</p>
            </div>
          ) : (
            <ol className="divide-y divide-line">
              {queue.slice(0, IN_QUEUE_CARD).map((order, i) => {
                const step = stageOf(order.status);
                return (
                  <li key={order.id}>
                    <Link href={`/vendor/orders?order=${order.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-canvas/60">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${
                          i === 0 ? "bg-ink text-white" : "bg-canvas text-muted ring-1 ring-line"
                        }`}
                      >
                        {i + 1}
                        <span className="sr-only"> in line</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {orderCode(order.id)} <span className="font-medium text-muted">· {order.checkout.resident.name.split(" ")[0]}</span>
                        </span>
                        <span className="block truncate text-xs text-muted">{itemsSummary(order.items)}</span>
                      </span>
                      {step && (
                        <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-line sm:inline-flex">
                          <span aria-hidden className={`size-1.5 rounded-full ${step.dot}`} />
                          {statusLabel(order.status, order.fulfillment)}
                        </span>
                      )}
                      <WaitClock since={order.createdAt} status={order.status} renderedAt={renderedAt} />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card title="Ratings" description="What residents say about your food" Icon={Star}>
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
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${reviews.ratingCount ? (count / reviews.ratingCount) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-5 text-right text-muted tabular-nums">{count}</span>
                      <span className="sr-only">
                        {count === 1 ? "rating" : "ratings"} with {5 - i} stars
                      </span>
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

        <Card
          title="Sales, last 14 days"
          description={<Trend change={percentChange(thisWeek, lastWeek)} label="this week vs last week" />}
          className="xl:col-span-2"
          footer={
            <Link href="/vendor/reports" className={CARD_LINK}>
              Reports for any period, with downloads
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
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

        <Card title="Best sellers" description="Most ordered, last 14 days" Icon={Flame}>
          {stats.bestSellers.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">Your best sellers show up here after your first orders.</p>
          ) : (
            <ol className="divide-y divide-line">
              {stats.bestSellers.map((dish, i) => (
                <li key={dish.name} className="flex items-center gap-3 px-5 py-3">
                  <span className={`w-4 text-sm font-bold tabular-nums ${i === 0 ? "text-brand-600" : "text-gray-400"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{dish.name}</span>
                      <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{formatPeso(dish.sales)}</span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(dish.quantity / topQuantity) * 100}%` }} />
                      </span>
                      <span className="w-14 text-right text-xs text-muted tabular-nums">{dish.quantity} sold</span>
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}

/** One of today's numbers. The ones that need action open the order queue. */
function Figure({ Icon, label, value, hint, href, alert }: { Icon: LucideIcon; label: string; value: string; hint: string; href?: string; alert?: boolean }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-muted">
          <span
            className={`flex size-8 items-center justify-center rounded-lg ring-1 ${alert ? "bg-brand-600 text-white ring-brand-600" : "bg-canvas text-muted ring-line"}`}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          {label}
        </span>
        {href && <ArrowRight className="size-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />}
      </span>
      <span className="mt-3 flex items-center gap-2 text-[26px] leading-tight font-bold tracking-tight text-ink tabular-nums">
        {value}
        {alert && (
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:animate-none" />
            <span className="relative size-2.5 rounded-full bg-amber-500" />
          </span>
        )}
      </span>
      <span className={`mt-0.5 block text-xs ${alert ? "font-semibold text-brand-700" : "text-muted"}`}>{hint}</span>
    </>
  );
  const box = `group block rounded-2xl border bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${
    alert ? "border-brand-200 ring-2 ring-brand-100" : "border-line"
  }`;
  return href ? (
    <Link href={href} className={`${box} transition hover:border-brand-200 focus-visible:outline-2 focus-visible:outline-brand-500`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
