"use client";

import { MapPin, ShoppingBasket, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { useJobsChanged } from "./use-open-jobs";

type Request = {
  id: string;
  shopName: string;
  shopAddress: string;
  budget: string;
  deliveryFee: string;
  feeMax: string | null;
  deliveryAddress: string;
  itemCount: number;
  customer: string;
  askedForYou: boolean;
  exclusiveUntil: string | null;
  distanceKm: number | null;
  needsPrescription: boolean;
  adultCheck: boolean;
  handling: string[];
};

/** What the rider should know before taking it */
const careOf = (r: Request) =>
  [
    r.needsPrescription && "Prescription medicine",
    r.adultCheck && "18+: check ID at the door",
    r.handling.includes("LPG") && "Gas tank",
    r.handling.includes("CHEMICAL") && "Chemical (sealed)",
    r.handling.includes("BULKY") && "Heavy or long item",
  ].filter(Boolean) as string[];

/**
 * Pabili requests a free rider can take: ones a customer asked them for (first, for a moment),
 * then any nearby. Shown above the delivery jobs; the list loads again whenever jobs change.
 * Store riders and offline riders get an empty list, so nothing shows.
 */
export function PabiliRequests({ busy }: { busy: boolean }) {
  const router = useRouter();
  const changed = useJobsChanged();
  const { data } = useApiData<{ errands: Request[] }>("/rider/errands", changed);
  const [taking, setTaking] = useState<string | null>(null);
  const requests = data?.errands ?? [];
  if (requests.length === 0) return null;

  async function take(id: string) {
    setTaking(id);
    const result = await apiRequest(`/rider/errands/${id}/accept`, { method: "POST" });
    setTaking(null);
    if (!result.ok) return toast.error("Couldn't take this Pabili", result.error);
    toast.success("Pabili is yours", "Go to the shop, buy the list, and snap the receipt.");
    router.push("/rider/active");
  }

  return (
    <section aria-labelledby="pabili-requests" className="mb-6">
      <h2 id="pabili-requests" className="mb-2 flex items-center gap-2 font-semibold text-ink">
        <ShoppingBasket className="size-5 text-brand-600" aria-hidden />
        Pabili requests
      </h2>
      <p className="mb-3 text-sm text-muted">
        Buy at the shop with your money; the customer pays you back in cash with the delivery fee, which is all yours. The fee is set from where you buy to the customer.
      </p>
      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id} className={`rounded-2xl border p-4 ${r.askedForYou ? "border-brand-300 bg-brand-50/60" : "border-line bg-white"}`}>
            {r.askedForYou && (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                <Sparkles className="size-3.5" aria-hidden />
                {r.customer} asked for you
              </p>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{r.shopName}</p>
                <p className="text-sm text-muted">{r.shopAddress}</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-700 tabular-nums">
                <span className="sr-only">You earn </span>+{r.feeMax && r.feeMax !== r.deliveryFee ? `₱${Math.round(Number(r.deliveryFee))}–${Math.round(Number(r.feeMax))}` : formatPeso(r.deliveryFee)}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink">
              {r.itemCount} {r.itemCount === 1 ? "thing" : "things"} to buy, up to <span className="font-semibold">{formatPeso(r.budget)}</span>
            </p>
            {careOf(r).length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-1">
                {careOf(r).map((c) => (
                  <span key={c} className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
                    {c}
                  </span>
                ))}
              </p>
            )}
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                To {r.deliveryAddress}
                {r.distanceKm !== null && ` · ${formatDistance(r.distanceKm)} from you`}
              </span>
            </p>
            <Button className="mt-3 w-full" loading={taking === r.id} disabled={busy || (taking !== null && taking !== r.id)} onClick={() => take(r.id)}>
              {busy ? "Finish your current job first" : "Take this Pabili"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
