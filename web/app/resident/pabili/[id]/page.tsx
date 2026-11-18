import { Banknote, Clock, ReceiptText, ShoppingBasket } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { RiderTracking } from "@/components/app/rider-tracking";
import { StepBar } from "@/components/app/step-bar";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { pinOf } from "@/lib/geo";
import { serverApi } from "@/lib/server-api";
import { ERRAND_STATUS, type Errand } from "../errand";
import { ErrandActions } from "./errand-actions";

export const metadata: Metadata = { title: "Pabili" };

type Detail = Errand & {
  preferredRider: { name: string } | null;
  rider: { name: string; phone: string | null; vehicle: string | null; rating: number | null } | null;
  riderLocation: { lat: number; lng: number; at: string } | null;
  total: number | null;
};

export default function PabiliDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <PabiliDetail params={params} />
    </Suspense>
  );
}

const STEPS = ["Sent", "Rider buying", "On the way", "Delivered"];
/** The step reached, counted from 0 (StepBar) */
const DONE = { REQUESTED: 0, ACCEPTED: 1, BOUGHT: 2, DELIVERED: 3, CANCELLED: 0 } as const;

async function PabiliDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("RESIDENT");
  const { id } = await params;
  const { errand, budgetMax } = await serverApi<{ errand: Detail; budgetMax: number }>(`/errands/${id}`);
  const live = errand.status === "REQUESTED" || errand.status === "ACCEPTED" || errand.status === "BOUGHT";
  const status = ERRAND_STATUS[errand.status];

  return (
    <>
      <MobileHeading title={`Pabili at ${errand.shopName}`} subtitle={errand.shopAddress} />
      <div className="mb-4 rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-4">
        <div className="flex items-center justify-between gap-3">
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          {errand.status === "CANCELLED" && errand.cancelReason && <span className="text-sm text-muted">{errand.cancelReason}</span>}
        </div>
        {errand.status !== "CANCELLED" && (
          <div className="mt-3">
            <StepBar steps={STEPS} done={DONE[errand.status]} />
          </div>
        )}
      </div>

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          {live && (
            <RiderTracking
              orderId={errand.id}
              initial={errand.riderLocation}
              store={{ lat: errand.shopLat, lng: errand.shopLng }}
              storeName={errand.shopName}
              home={pinOf(errand.deliveryLat, errand.deliveryLng)}
              homeAddress={errand.deliveryAddress}
              rider={errand.rider}
              pickedUp={errand.status === "BOUGHT"}
              pabili
              askedFor={errand.status === "REQUESTED" && errand.exclusiveUntil ? errand.preferredRider?.name : null}
            />
          )}
          {errand.status === "REQUESTED" && !errand.exclusiveUntil && (
            <p className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
              <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
              The free riders near {errand.shopName} can see it. If nobody takes it soon, it&apos;s cancelled and you pay nothing.
            </p>
          )}
          <ErrandActions id={errand.id} status={errand.status} budget={Number(errand.budget)} budgetMax={budgetMax} />
        </div>

        <div className="space-y-4">
          <section aria-labelledby="pabili-list" className="rounded-2xl border border-line p-4">
            <h2 id="pabili-list" className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              <ShoppingBasket className="size-4 text-brand-600" aria-hidden />
              To buy · up to {formatPeso(errand.budget)}
            </h2>
            <ul className="space-y-2 text-[0.9375rem] text-ink">
              {errand.items.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-8 shrink-0 font-semibold text-brand-700 tabular-nums">{item.quantity}×</span>
                  <span className="min-w-0 flex-1">
                    {item.name}
                    {item.note && <span className="block text-[0.8125rem] text-amber-800">“{item.note}”</span>}
                  </span>
                </li>
              ))}
            </ul>
            {errand.notes && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm text-ink">{errand.notes}</p>}
          </section>

          <section aria-labelledby="pabili-pay" className="rounded-2xl border border-line p-4">
            <h2 id="pabili-pay" className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              <Banknote className="size-4 text-brand-600" aria-hidden />
              What you pay, in cash
            </h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{errand.receiptTotal ? "Items (the receipt)" : "Items, at most"}</dt>
                <dd className="text-ink tabular-nums">{formatPeso(errand.receiptTotal ?? errand.budget)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Delivery fee</dt>
                <dd className="text-ink tabular-nums">{formatPeso(errand.deliveryFee)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-1 text-[0.9375rem] font-bold text-ink">
                <dt>{errand.total !== null ? "Total" : "Total, at most"}</dt>
                <dd className="tabular-nums">{formatPeso(errand.total ?? Number(errand.budget) + Number(errand.deliveryFee))}</dd>
              </div>
            </dl>
          </section>

          {errand.receiptPhotoUrl && (
            <section aria-labelledby="pabili-receipt" className="rounded-2xl border border-line p-4">
              <h2 id="pabili-receipt" className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <ReceiptText className="size-4 text-brand-600" aria-hidden />
                The receipt
              </h2>
              <a href={errand.receiptPhotoUrl} target="_blank" rel="noreferrer" className="relative block aspect-[3/4] max-h-96 overflow-hidden rounded-xl bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500">
                <Image src={errand.receiptPhotoUrl} alt={`Receipt from ${errand.shopName}, ${formatPeso(errand.receiptTotal ?? 0)}`} fill unoptimized className="object-contain" />
              </a>
            </section>
          )}
          {errand.deliveryPhotoUrl && (
            <section aria-labelledby="pabili-proof" className="rounded-2xl border border-line p-4">
              <h2 id="pabili-proof" className="mb-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Proof of delivery
              </h2>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-canvas">
                <Image src={errand.deliveryPhotoUrl} alt="Photo of the delivered items" fill unoptimized className="object-cover" />
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
