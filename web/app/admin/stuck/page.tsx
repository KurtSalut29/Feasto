import { Bike, CircleCheck, Hourglass, Phone, ShoppingBag, Store, User, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Fulfillment } from "@/lib/types";
import { StuckActions } from "./stuck-actions";

export const metadata: Metadata = { title: "Stuck orders" };

type Reason = "NO_STORE_REPLY" | "NO_RIDER" | "RIDER_NOT_COLLECTING" | "ON_THE_ROAD";
type Person = { name: string; phone: string | null };
type StuckOrder = {
  id: string;
  code: string;
  reason: Reason;
  since: string;
  fulfillment: Fulfillment;
  subtotal: string;
  deliveryFee: string;
  vendor: Person;
  rider: Person | null;
  checkout: { resident: Person };
};
type Response = { stuckMinutes: number; ridersOnline: number; page: number; pageSize: number; total: number; orders: StuckOrder[] };

const REASON: Record<Reason, { label: string; tone: BadgeTone; advice: string }> = {
  NO_STORE_REPLY: { label: "Store hasn't replied", tone: "warning", advice: "Call the store. If nobody answers, cancel so the resident isn't left waiting." },
  NO_RIDER: { label: "No rider yet", tone: "danger", advice: "Ask every rider to take it. If no one is available, call the resident or cancel." },
  RIDER_NOT_COLLECTING: { label: "Rider hasn't collected it", tone: "danger", advice: "The food is ready. Call the rider, or give the job to another rider." },
  ON_THE_ROAD: { label: "On the road too long", tone: "warning", advice: "Call the rider and the resident to find out what happened." },
};

/** "23 min", "2 h" or "3 days". */
function waited(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  const days = Math.floor(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function Contact({ Icon, role, person }: { Icon: LucideIcon; role: string; person: Person }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{person.name}</span>
        <span className="block text-muted">
          {role}
          {person.phone && (
            <>
              {" · "}
              <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                <Phone className="size-3" aria-hidden />
                {person.phone}
              </a>
            </>
          )}
        </span>
      </span>
    </li>
  );
}

export default function AdminStuckPage({ searchParams }: PageProps<"/admin/stuck">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Stuck searchParams={searchParams} />
    </Suspense>
  );
}

async function Stuck({ searchParams }: Pick<PageProps<"/admin/stuck">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const data = await serverApi<Response>(`/admin/stuck?page=${page}`);

  return (
    <>
      <PageHeader
        title="Stuck orders"
        description={
          <>
            Orders waiting over {data.stuckMinutes} minutes for a store or rider, or over an hour on the road. {data.ridersOnline} free {data.ridersOnline === 1 ? "rider is" : "riders are"} available now.{" "}
            <Link href="/admin/settings" className="font-semibold text-brand-700 hover:underline">
              Change the wait
            </Link>
          </>
        }
      />

      {data.orders.length === 0 ? (
        <Card>
          <EmptyState Icon={CircleCheck} title="Nothing is stuck" text="Every order is moving. Orders that wait too long appear here, and you'll get a notification." />
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {data.orders.map((order) => {
            const reason = REASON[order.reason];
            return (
              <li key={order.id} className="flex flex-col rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {order.code} <span className="font-normal text-muted">· {formatPeso(Number(order.subtotal) + Number(order.deliveryFee))}</span>
                    </p>
                    <p className="inline-flex items-center gap-1 text-sm text-muted">
                      {order.fulfillment === "DELIVERY" ? <Bike className="size-3.5" aria-hidden /> : <ShoppingBag className="size-3.5" aria-hidden />}
                      {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={reason.tone} dot>
                      {reason.label}
                    </Badge>
                    <p className="mt-1 inline-flex w-full items-center justify-end gap-1 text-sm font-semibold text-ink tabular-nums">
                      <Hourglass className="size-3.5 text-gray-400" aria-hidden />
                      {waited(order.since)}
                    </p>
                  </div>
                </div>
                <ul className="grid flex-1 gap-3 px-5 py-4 sm:grid-cols-2">
                  <Contact Icon={Store} role="Store" person={order.vendor} />
                  <Contact Icon={User} role="Resident" person={order.checkout.resident} />
                  {order.rider && <Contact Icon={Bike} role="Rider" person={order.rider} />}
                </ul>
                <p className="px-5 pb-4 text-sm text-muted">{reason.advice}</p>
                <div className="border-t border-line bg-canvas/40 px-5 py-3">
                  <StuckActions orderId={order.id} code={order.code} reason={order.reason} riderName={order.rider?.name ?? null} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4">
        <Pagination page={page} pageSize={data.pageSize} total={data.total} noun="orders" href={(n) => `/admin/stuck${n > 1 ? `?page=${n}` : ""}`} />
      </div>
    </>
  );
}
