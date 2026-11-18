"use client";

import { Camera, Clock, MapPinCheck, Navigation } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, use, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DirectionsView, type Destination } from "@/components/map/directions-button";
import { useMyLocation } from "@/components/map/use-my-location";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { distanceKm, type LatLng } from "@/lib/geo";
import type { OrderStatus } from "@/lib/types";

/** Closer than this to a stop counts as being there (GPS is off by a few metres; the demo ride ends right on it) */
const ARRIVED_KM = 0.06;

type Stop = { at: LatLng | null; name: string; address: string; near?: LatLng | null };
type Leg = "store" | "home";

const OpenContext = createContext<((leg: Leg) => void) | null>(null);

/**
 * The directions for the rider's current delivery. They follow the trip: while the way to the
 * store is open, the bottom of the screen says what to do there (pick up once the store marks it
 * ready), and the moment the pickup is confirmed the same screen turns into the way to the
 * customer. On arrival there, it leads to the delivery photo.
 */
export function TripDirections({ orderId, status, store, home, children }: { orderId: string; status: OrderStatus; store: Stop; home: Stop; children: ReactNode }) {
  const [open, setOpen] = useState<Leg | null>(null);
  // The order moved on while the directions were open (pickup confirmed here or by another tap): go on to the customer
  const [seen, setSeen] = useState(status);
  if (seen !== status) {
    setSeen(status);
    if (status === "PICKED_UP" && open === "store") setOpen("home");
  }

  const stop = open === "home" ? home : store;
  const destination: Destination = { at: stop.at, name: stop.name, address: stop.address, kind: open ?? "store", near: stop.near };

  return (
    <OpenContext value={setOpen}>
      {children}
      {open &&
        createPortal(
          <DirectionsView
            key={open}
            destination={destination}
            onClose={() => setOpen(null)}
            footer={<NextStep leg={open} orderId={orderId} status={status} stop={stop} onClose={() => setOpen(null)} />}
          />,
          document.body,
        )}
    </OpenContext>
  );
}

/** The Directions button on one stop of the route */
export function TripDirectionsButton({ leg, name, className }: { leg: Leg; name: string; className?: string }) {
  const open = use(OpenContext);
  return (
    <button type="button" onClick={() => open?.(leg)} aria-haspopup="dialog" aria-label={`Directions to ${name}`} className={className}>
      <Navigation className="size-4 text-brand-600" aria-hidden />
      Directions
    </button>
  );
}

/** What to do at this stop, shown above the turns once it applies */
function NextStep({ leg, orderId, status, stop, onClose }: { leg: Leg; orderId: string; status: OrderStatus; stop: Stop; onClose: () => void }) {
  const router = useRouter();
  const me = useMyLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const here = !!me && !!stop.at && distanceKm(me, stop.at) <= ARRIVED_KM;

  async function pickUp() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest(`/rider/active/${orderId}/picked-up`, { method: "POST" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    toast.success("Pickup confirmed", "The directions now lead to the customer.");
    router.refresh();
  }

  let body: ReactNode = null;
  if (leg === "store" && status === "READY") {
    body = (
      <Panel Icon={MapPinCheck} title={here ? `You're at ${stop.name}` : `The order is ready at ${stop.name}`} text="Get the order, then confirm the pickup. The directions switch to the customer.">
        <Button className="mt-3 w-full" loading={busy} onClick={pickUp}>
          I picked up the order
        </Button>
      </Panel>
    );
  } else if (leg === "store" && status !== "PICKED_UP" && here) {
    body = <Panel Icon={Clock} title={`You're at ${stop.name}`} text="Waiting for the store to mark the order ready. This updates by itself." />;
  } else if (leg === "home" && here) {
    body = (
      <Panel Icon={MapPinCheck} title={`You're at ${stop.name}'s place`} text="Hand over the order, then take the delivery photo to finish.">
        <Button
          className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700"
          onClick={() => {
            onClose();
            requestAnimationFrame(() => document.getElementById("proof")?.scrollIntoView({ behavior: "smooth", block: "center" }));
          }}
        >
          <Camera className="size-4" aria-hidden />
          Take the delivery photo
        </Button>
      </Panel>
    );
  }
  if (!body) return null;
  return (
    <div aria-live="polite">
      {body}
      {error && <p className="-mt-2 px-4 pb-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Panel({ Icon, title, text, children }: { Icon: typeof Clock; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="border-b border-line bg-brand-50/60 px-4 py-3.5">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Icon className="size-5 shrink-0 text-brand-600" aria-hidden />
        {title}
      </p>
      <p className="mt-0.5 text-sm text-muted">{text}</p>
      {children}
    </div>
  );
}
