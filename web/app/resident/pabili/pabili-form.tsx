"use client";

import { Banknote, MapPin, Minus, Plus, Store, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RiderPicker, type ChoosableRider } from "@/components/app/rider-picker";
import { useApiData } from "@/components/app/use-api-data";
import { LocationPicker } from "@/components/map/location-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { Address } from "@/lib/types";

type Item = { key: number; name: string; quantity: number; note: string };

let nextKey = 1;
const blankItem = (): Item => ({ key: nextKey++, name: "", quantity: 1, note: "" });

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`pabili-${n}`} className="rounded-2xl border border-line bg-white p-4">
      <h2 id={`pabili-${n}`} className="mb-3 flex items-center gap-2 font-semibold text-ink">
        <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Asking for a Pabili in one go: the shop and its pin, everything to buy as a list, the most the
 * rider may spend, where to bring it, and (if they like) which rider. Easier than sending a rider
 * one message per item: the rider gets the whole list, the fee is known before sending, and the
 * receipt photo shows exactly what was spent.
 */
export function PabiliForm({ addresses, budgetMax, waitMinutes }: { addresses: Address[]; budgetMax: number; waitMinutes: number }) {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shop, setShop] = useState<LatLng | null>(null);
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [rider, setRider] = useState<ChoosableRider | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const home = addresses.find((a) => a.id === addressId);
  const near = home?.latitude != null && home.longitude != null ? { lat: home.latitude, lng: home.longitude } : null;
  const { data: quote } = useApiData<{ fee: number; km: number | null }>(shop && addressId ? `/errands/quote?lat=${shop.lat}&lng=${shop.lng}&addressId=${addressId}` : null);
  const spend = Number(budget) || 0;

  const update = (key: number, change: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));
  const err = (name: string) => fieldErrors[name]?.[0];

  async function send() {
    setError(undefined);
    const filled = items.filter((i) => i.name.trim());
    const problems: FieldErrors = {
      ...(shopName.trim().length < 2 && { shopName: ["Enter the shop's name."] }),
      ...(shopAddress.trim().length < 3 && { shopAddress: ["Say where the shop is, like the street or a landmark."] }),
      ...(!shop && { shopLat: ["Move the map so the pin sits on the shop."] }),
      ...(filled.length === 0 && { items: ["Add at least one thing to buy."] }),
      ...((spend < 20 || spend > budgetMax) && { budget: [`Enter ₱20 to ₱${budgetMax.toLocaleString("en-PH")}.`] }),
      ...(!addressId && { addressId: ["Choose where to deliver it."] }),
    };
    setFieldErrors(problems);
    if (Object.keys(problems).length) return;

    setSending(true);
    const result = await apiRequest<{ errand: { id: string } }>("/errands", {
      method: "POST",
      body: {
        shopName,
        shopAddress,
        shopLat: shop!.lat,
        shopLng: shop!.lng,
        items: filled.map((i) => ({ name: i.name, quantity: i.quantity, note: i.note || undefined })),
        notes: notes || undefined,
        budget: spend,
        addressId,
        preferredRiderId: rider?.id,
        expectedFee: quote?.fee,
      },
    });
    setSending(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    toast.success("Pabili sent", rider ? `${rider.name} gets it first. We'll tell you when a rider takes it.` : "The riders nearby can see it now. We'll tell you when one takes it.");
    router.push(`/resident/pabili/${result.data.errand.id}`);
  }

  if (addresses.length === 0) {
    return (
      <Alert tone="pending">
        Add a delivery address first, so the rider knows where to bring it.{" "}
        <Link href="/resident/addresses" className="font-semibold underline">
          Add an address
        </Link>
      </Alert>
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Section n={1} title="Where to buy">
        <div className="space-y-3">
          <TextField label="Shop name" name="shopName" icon={Store} value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Aling Rosa's Sari-sari Store" required error={err("shopName")} />
          <TextField
            label="Where it is"
            name="shopAddress"
            icon={MapPin}
            value={shopAddress}
            onChange={(e) => setShopAddress(e.target.value)}
            placeholder="Street, barangay or a landmark"
            required
            error={err("shopAddress")}
          />
          <LocationPicker value={shop} onChange={setShop} near={near} label="The shop on the map" hint="Move the map so the pin sits on the shop. It sets the delivery fee and the rider's directions." required error={err("shopLat") ?? err("shopLng")} />
        </div>
      </Section>

      <Section n={2} title="What to buy">
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={item.key} className="rounded-xl border border-line p-3">
              <div className="flex items-end gap-2">
                <TextField
                  className="min-w-0 flex-1"
                  label={`Item ${index + 1}`}
                  value={item.name}
                  onChange={(e) => update(item.key, { name: e.target.value })}
                  placeholder={index === 0 ? "Coke 1.5L" : "What else?"}
                  error={index === 0 ? err("items") : undefined}
                />
                <div className="flex shrink-0 items-center gap-1 pb-0.5" role="group" aria-label={`How many of item ${index + 1}`}>
                  <button
                    type="button"
                    onClick={() => update(item.key, { quantity: Math.max(1, item.quantity - 1) })}
                    aria-label="One less"
                    className="flex size-10 items-center justify-center rounded-full border border-line text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <span className="w-7 text-center font-semibold text-ink tabular-nums" aria-live="polite">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => update(item.key, { quantity: Math.min(50, item.quantity + 1) })}
                    aria-label="One more"
                    className="flex size-10 items-center justify-center rounded-full border border-line text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={item.note}
                  onChange={(e) => update(item.key, { note: e.target.value })}
                  placeholder="Note, like the brand or size (optional)"
                  aria-label={`Note for item ${index + 1}`}
                  maxLength={120}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-canvas/60 px-3 text-sm text-ink placeholder:text-gray-500 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                    aria-label={`Remove item ${index + 1}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {items.length < 20 && (
          <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => setItems((list) => [...list, blankItem()])}>
            <Plus className="size-4" aria-hidden />
            Add another item
          </Button>
        )}
        <TextareaField className="mt-3" label="Anything else the rider should know (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} rows={2} placeholder="If they're out of Coke, get Royal instead." />
      </Section>

      <Section n={3} title="Budget">
        <TextField
          label="The most the rider may spend on the items"
          name="budget"
          type="number"
          inputMode="decimal"
          icon={Banknote}
          min={20}
          max={budgetMax}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="500"
          required
          error={err("budget")}
          hint={`Up to ₱${budgetMax.toLocaleString("en-PH")}. The rider pays at the shop and shows you the receipt; you pay them back in cash, plus the delivery fee.`}
        />
      </Section>

      <Section n={4} title="Deliver to">
        <div className="space-y-2" role="radiogroup" aria-label="Delivery address">
          {addresses.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
                addressId === a.id ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line hover:bg-canvas"
              }`}
            >
              <input type="radio" name="address" className="sr-only" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
              <MapPin className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{a.label}</span>
                <span className="block text-sm text-muted">{[a.details, a.landmark].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section n={5} title="Who buys it">
        <RiderPicker near={shop} value={rider} onChange={setRider} />
      </Section>

      <div className="rounded-2xl border border-line bg-canvas/60 p-4 text-sm">
        <dl className="space-y-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Items, at most</dt>
            <dd className="font-semibold text-ink tabular-nums">{spend ? formatPeso(spend) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Delivery fee</dt>
            <dd className="font-semibold text-ink tabular-nums">{quote ? formatPeso(quote.fee) : shop ? "…" : "Set the shop's pin"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-1 text-[0.9375rem] font-bold text-ink">
            <dt>Cash to have ready, at most</dt>
            <dd className="tabular-nums">{spend && quote ? formatPeso(spend + quote.fee) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-muted">
          You pay what the receipt says, not the whole budget. If no rider takes it in {waitMinutes} minutes, it&apos;s cancelled and you pay nothing.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" className="w-full" loading={sending}>
        Send Pabili
      </Button>
    </form>
  );
}
