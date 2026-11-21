import { Banknote, ExternalLink, IdCard, MapPin, Phone, Pill, ShoppingBasket, TriangleAlert } from "lucide-react";
import type { PabiliItem } from "@/lib/pabili";
import { PabiliList } from "../../resident/pabili/pabili-list";
import { NotBoughtButton, NothingBought } from "./errand-item-actions";
import { StepBar } from "@/components/app/step-bar";
import { DirectionsButton } from "@/components/map/directions-button";
import { formatPeso } from "@/lib/format";
import { pinOf } from "@/lib/geo";
import { mapsSearch } from "../../resident/pabili/errand";
import { ErrandSteps } from "./errand-steps";
import { LocationSharer } from "./location-sharer";
import { RiderTripMap } from "./rider-trip-map";
import { ReportProblem } from "@/components/app/report-problem";

export type RiderErrand = {
  id: string;
  status: "ACCEPTED" | "BOUGHT";
  shopName: string;
  shopAddress: string;
  shopLat: number | null;
  shopLng: number | null;
  items: PabiliItem[];
  adultCheck: boolean;
  handling: string[];
  hasPrescription: boolean;
  estimateTotal: string | null;
  notes: string | null;
  budget: string;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryFee: string;
  feeMax: string | null;
  receiptTotal: string | null;
  resident: { name: string; phone: string | null };
};

const pill =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * The Pabili the rider is running: the map with the customer's pin and the rider's live location
 * (the same as a delivery, so the customer follows them), the shopping list, the next step
 * (receipt, then the delivery photo), and how much cash to collect. The shop has no pin: the
 * rider finds it by its name and address (or a Google Maps search), and their spot when they
 * buy becomes the shop's.
 */
export function ErrandActive({ errand }: { errand: RiderErrand }) {
  const shop = pinOf(errand.shopLat, errand.shopLng);
  const home = pinOf(errand.deliveryLat, errand.deliveryLng);
  const bought = errand.status === "BOUGHT";
  const fee = Number(errand.deliveryFee);
  const feeMax = Number(errand.feeMax ?? errand.deliveryFee);
  // The demo ride needs somewhere to ride to before the shop is known: a few streets from the customer
  const demoShop = shop ?? (home ? { lat: home.lat + 0.006, lng: home.lng + 0.004 } : null);
  const first = errand.resident.name.split(" ")[0];
  const adultBought = errand.adultCheck && errand.items.some((i) => !i.notBought && i.flags?.some((f) => f === "ALCOHOL" || f === "TOBACCO"));
  const careNotes = [
    errand.hasPrescription && { Icon: Pill, text: "Medicine with a prescription: show the pharmacist the prescription below. If they won't sell it, mark it “Couldn't buy this”." },
    adultBought && { Icon: IdCard, text: `Alcohol or cigarettes: check ${first}'s ID at the door (18 or older) before handing them over.` },
    errand.handling.includes("CHEMICAL") && { Icon: TriangleAlert, text: "A chemical is on the list: only sealed containers, kept upright and away from food." },
    errand.handling.includes("LPG") && { Icon: TriangleAlert, text: "A gas tank is on the list: only take it if you can carry it safely and tied down. Otherwise mark it “Too big for the motorcycle”." },
    errand.handling.includes("BULKY") && { Icon: TriangleAlert, text: "Something heavy or long is on the list. If it won't fit safely, mark it “Too big for the motorcycle”." },
  ].filter(Boolean) as { Icon: typeof Pill; text: string }[];

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
            <span className="sr-only">You earn </span>+{bought || feeMax === fee ? formatPeso(fee) : `₱${Math.round(fee)}–${Math.round(feeMax)}`}
          </span>
        </div>
        <div className="mt-3">
          <StepBar steps={["Accepted", "Bought", "Delivered"]} done={bought ? 1 : 0} />
        </div>
      </section>

      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0 lg:[&>*:first-child]:sticky lg:[&>*:first-child]:top-6 lg:[&>*:first-child]:row-span-[12] lg:[&>*:not(:first-child)]:col-start-2">
        <RiderTripMap store={shop} home={home} homeAddress={errand.deliveryAddress} status={bought ? "PICKED_UP" : "ACCEPTED"} />
        <ErrandSteps id={errand.id} status={errand.status} budget={Number(errand.budget)} fee={fee} feeMax={feeMax} adultBought={adultBought} />
        <LocationSharer orderId={errand.id} heading={bought ? "home" : "store"} store={demoShop} home={home} />

        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
          <Banknote className="size-6 shrink-0" aria-hidden />
          <p className="text-sm">
            {bought ? (
              <>
                Collect <span className="text-base font-bold">{formatPeso(Number(errand.receiptTotal ?? 0) + fee)}</span> in cash: the receipt plus your fee.
              </>
            ) : (
              <>Pay at the shop with your money (up to {formatPeso(errand.budget)}). {first} pays you back in cash with your fee, set from where you buy.</>
            )}
          </p>
        </div>

        {careNotes.length > 0 && (
          <ul aria-label="Take care" className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            {careNotes.map(({ Icon, text }) => (
              <li key={text} className="flex gap-2">
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        )}

        <section className="rounded-2xl border border-line p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
            The list · up to {formatPeso(errand.budget)}
            {errand.estimateTotal ? ` · about ${formatPeso(errand.estimateTotal)}` : ""}
          </h2>
          <PabiliList items={errand.items} action={bought ? undefined : (item, i) => <NotBoughtButton errandId={errand.id} index={i} item={item} />} />
          {errand.notes && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm text-ink">{errand.notes}</p>}
          {errand.hasPrescription && (
            <a href={`/api/rider/errands/${errand.id}/prescription`} target="_blank" rel="noreferrer" className={`mt-3 ${pill}`}>
              <Pill className="size-4 text-brand-600" aria-hidden />
              Show the prescription
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          {!bought && (
            <div className="mt-3 border-t border-line pt-3">
              <NothingBought errandId={errand.id} />
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-line p-4">
          <Stop label={bought ? "Bought at" : "1 · Buy at"} title={errand.shopName} address={errand.shopAddress}>
            {!bought && (
              <a href={mapsSearch(errand.shopName, errand.shopAddress)} target="_blank" rel="noopener noreferrer" className={pill}>
                <ExternalLink className="size-4 text-brand-600" aria-hidden />
                Find it on Google Maps
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
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
        <div className="flex justify-center">
          <ReportProblem target={{ errandId: errand.id }} people={[{ role: "RESIDENT", name: errand.resident.name }]} />
        </div>
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
