"use client";

import { ArrowRight, Banknote, MapPin, Minus, Plus, Store, Trash2, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RiderPicker, type ChoosableRider } from "@/components/app/rider-picker";
import { useApiData } from "@/components/app/use-api-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
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
 * Asking for a Pabili in one go: the shop (its name and where it is; no map pin), everything to buy as a list, the most the
 * rider may spend, where to bring it, and (if they like) which rider. Easier than sending a rider
 * one message per item: the rider gets the whole list, the fee is known before sending, and the
 * receipt photo shows exactly what was spent.
 */
export function PabiliForm({ addresses, budgetMax, waitMinutes }: { addresses: Address[]; budgetMax: number; waitMinutes: number }) {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
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
  // The shop has no pin, so the fee is a range until the rider buys: their phone sets the real one
  const { data: quote } = useApiData<{ min: number; max: number; maxKm: number; busyFee: number; busy: string | null; rainFee: number }>("/errands/quote");
  const spend = Number(budget) || 0;
  const most = `₱${budgetMax.toLocaleString("en-PH")}`;
  // Said as soon as it's typed, with why and what to do instead
  const overLimit = spend > budgetMax ? `${most} is the most for one Pabili, because the rider pays at the shop with their own money. Lower the budget, or split your list into two Pabili.` : undefined;

  const update = (key: number, change: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));
  const err = (name: string) => fieldErrors[name]?.[0];

  async function send() {
    setError(undefined);
    const filled = items.filter((i) => i.name.trim());
    const problems: FieldErrors = {
      ...(shopName.trim().length < 2 && { shopName: ["Enter the shop's name."] }),
      ...(shopAddress.trim().length < 3 && { shopAddress: ["Say where the shop is, like the street or a landmark."] }),
      ...(filled.length === 0 && { items: ["Add at least one thing to buy."] }),
      ...(spend < 20 && { budget: ["Enter at least ₱20."] }),
      ...(overLimit && { budget: [overLimit] }),
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
        items: filled.map((i) => ({ name: i.name, quantity: i.quantity, note: i.note || undefined })),
        notes: notes || undefined,
        budget: spend,
        addressId,
        preferredRiderId: rider?.id,
        expectedFee: quote?.min,
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
          <OnFeasto name={shopName} />
          <TextField
            label="Where it is"
            name="shopAddress"
            icon={MapPin}
            value={shopAddress}
            onChange={(e) => setShopAddress(e.target.value)}
            placeholder="Across the plaza, beside the bakery"
            hint="A street, barangay or landmark the rider will know. No map needed: the rider finds it."
            required
            error={err("shopAddress")}
          />
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
          error={overLimit ?? err("budget")}
          hint={`₱20 to ${most}. The rider pays at the shop and shows you the receipt; you pay them back in cash, plus the delivery fee.`}
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
        <RiderPicker near={near} value={rider} onChange={setRider} />
      </Section>

      <div className="rounded-2xl border border-line bg-canvas/60 p-4 text-sm">
        <dl className="space-y-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Items, at most</dt>
            <dd className="font-semibold text-ink tabular-nums">{spend ? formatPeso(spend) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Delivery fee</dt>
            <dd className="font-semibold text-ink tabular-nums">{quote ? `${formatPeso(quote.min)} to ${formatPeso(quote.max)}` : "…"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-1 text-[0.9375rem] font-bold text-ink">
            <dt>Cash to have ready, at most</dt>
            <dd className="tabular-nums">{spend && quote ? formatPeso(spend + quote.max) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-muted">
          {quote && quote.busyFee + quote.rainFee > 0 && (
            <>
              It includes {formatPeso(quote.busyFee + quote.rainFee)} for the rider {quote.busyFee > 0 && quote.rainFee > 0 ? "because riders are busy and it's raining" : quote.busyFee > 0 ? `because riders are busy (${quote.busy})` : "because it's raining"}.{" "}
            </>
          )}
          The delivery fee is set when the rider buys, from where the shop is to you, and never more than {quote ? formatPeso(quote.max) : "the most shown"}. You pay what the receipt says, not the whole budget. If no rider takes it in {waitMinutes} minutes, it&apos;s cancelled and you pay nothing.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" className="w-full" loading={sending}>
        Send Pabili
      </Button>
    </form>
  );
}

type FeastoStore = { id: string; name: string; address: string };

/**
 * When the shop being typed is a Feasto store, point to its menu instead: ordering there reaches
 * the store right away, and the resident can still choose their rider at checkout.
 */
function OnFeasto({ name }: { name: string }) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(name.trim()), 300);
    return () => clearTimeout(t);
  }, [name]);
  const { data } = useApiData<{ stores: FeastoStore[] }>(search.length >= 3 ? `/errands/on-feasto?q=${encodeURIComponent(search)}` : null);
  const stores = search.length >= 3 ? (data?.stores ?? []) : [];
  if (stores.length === 0) return null;
  return (
    <div aria-live="polite" className="space-y-2">
      {stores.map((s) => (
        <div key={s.id} className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <UtensilsCrossed className="size-4 shrink-0 text-brand-600" aria-hidden />
            {s.name} is on Feasto
          </p>
          <p className="mt-1 text-sm text-muted">Order from its menu instead: the store gets your order right away, and you can still choose your rider at checkout.</p>
          <Link
            href={`/resident/stores/${s.id}`}
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            See the menu
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ))}
    </div>
  );
}
