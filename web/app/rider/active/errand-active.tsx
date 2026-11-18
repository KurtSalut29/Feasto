import { Banknote, MapPin, Phone, ShoppingBasket } from "lucide-react";
import { StepBar } from "@/components/app/step-bar";
import { DirectionsButton } from "@/components/map/directions-button";
import { formatPeso } from "@/lib/format";
import { pinOf } from "@/lib/geo";
import { ErrandSteps } from "./errand-steps";
import { LocationSharer } from "./location-sharer";
import { RiderTripMap } from "./rider-trip-map";

export type RiderErrand = {
  id: string;
  status: "ACCEPTED" | "BOUGHT";
  shopName: string;
  shopAddress: string;
  shopLat: number;
  shopLng: number;
  items: { name: string; quantity: number; note: string | null }[];
  notes: string | null;
  budget: string;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryFee: string;
  receiptTotal: string | null;
  resident: { name: string; phone: string | null };
};

const pill =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * The Pabili the rider is running: the map and live location (the same as a delivery, so the
 * customer follows them), the shopping list, the next step (receipt, then the delivery photo),
 * and how much cash to collect.
 */
export function ErrandActive({ errand }: { errand: RiderErrand }) {
  const shop = { lat: errand.shopLat, lng: errand.shopLng };
  const home = pinOf(errand.deliveryLat, errand.deliveryLng);
  const bought = errand.status === "BOUGHT";
  const fee = Number(errand.deliveryFee);
  const first = errand.resident.name.split(" ")[0];

  return (
    <>
      <section aria-label="Pabili progress" className="mb-3 rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ShoppingBasket className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.375rem] leading-tight font-bold tracking-tight text-ink">Pabili for {first}</h1>
            <p className="mt-0.5 truncate text-sm text-muted">Buy at {errand.shopName}</p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-700 tabular-nums">
            <span className="sr-only">You earn </span>+{formatPeso(fee)}
          </span>
        </div>
        <div className="mt-3">
          <StepBar steps={["Accepted", "Bought", "Delivered"]} done={bought ? 1 : 0} />
        </div>
      </section>

      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0 lg:[&>*:first-child]:sticky lg:[&>*:first-child]:top-6 lg:[&>*:first-child]:row-span-[12] lg:[&>*:not(:first-child)]:col-start-2">
        <RiderTripMap store={shop} home={home} homeAddress={errand.deliveryAddress} status={bought ? "PICKED_UP" : "ACCEPTED"} />
        <ErrandSteps id={errand.id} status={errand.status} budget={Number(errand.budget)} fee={fee} />
        <LocationSharer orderId={errand.id} heading={bought ? "home" : "store"} store={shop} home={home} />

        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
          <Banknote className="size-6 shrink-0" aria-hidden />
          <p className="text-sm">
            {bought ? (
              <>
                Collect <span className="text-base font-bold">{formatPeso(Number(errand.receiptTotal ?? 0) + fee)}</span> in cash: the receipt plus your fee.
              </>
            ) : (
              <>Pay at the shop with your money (up to {formatPeso(errand.budget)}). {first} pays you back in cash with your fee.</>
            )}
          </p>
        </div>

        <section className="rounded-2xl border border-line p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">The list · up to {formatPeso(errand.budget)}</h2>
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

        <section className="space-y-4 rounded-2xl border border-line p-4">
          <Stop label={bought ? "Bought at" : "1 · Buy at"} title={errand.shopName} address={errand.shopAddress}>
            <DirectionsButton to={shop} name={errand.shopName} address={errand.shopAddress} kind="store" className={pill} />
          </Stop>
          <Stop label="2 · Deliver to" title={errand.resident.name} address={errand.deliveryAddress}>
            <DirectionsButton to={home} near={shop} name={errand.resident.name} address={errand.deliveryAddress} kind="home" className={pill} />
            {errand.resident.phone && (
              <a href={`tel:${errand.resident.phone}`} aria-label={`Call ${errand.resident.name}`} className={pill}>
                <Phone className="size-4 text-brand-600" aria-hidden />
                Call
              </a>
            )}
          </Stop>
        </section>
      </div>
    </>
  );
}

function Stop({ label, title, address, children }: { label: string; title: string; address: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <MapPin className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">{label}</p>
        <p className="mt-0.5 font-semibold text-ink">{title}</p>
        <p className="text-sm text-muted">{address}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
      </div>
    </div>
  );
}
