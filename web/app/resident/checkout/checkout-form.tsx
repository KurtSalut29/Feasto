"use client";

import { Bike, LoaderCircle, MapPin, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DishPhoto } from "@/components/app/dish-photo";
import { DeliveryFeeLine } from "@/components/app/delivery-fee";
import { PAYMENT_OPTIONS, takes } from "@/components/app/payment-brands";
import { useApiData } from "@/components/app/use-api-data";
import { type PayChoice, PaymentPicker } from "./payment-picker";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SwitchField } from "@/components/ui/switch-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/browser-api";
import { celebrate } from "@/components/app/celebrate";
import { formatPeso } from "@/lib/format";
import { clockOf, scheduleDays, sendAtOf, whenInSentence, whenOf } from "@/lib/schedule";
import type { Address, Cart, Fulfillment, PaymentMethod } from "@/lib/types";
import { WhenPicker } from "./when-picker";

function Choice({
  name,
  checked,
  onChange,
  title,
  text,
  Icon,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  text?: string;
  Icon: typeof MapPin;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
        checked ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line hover:border-gray-300"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <Icon className={`mt-0.5 size-5 shrink-0 ${checked ? "text-brand-600" : "text-muted"}`} aria-hidden />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        {text && <span className="block text-sm text-muted">{text}</span>}
      </span>
    </label>
  );
}

/** One numbered step of checkout; the steps follow the order a resident decides in. */
function Step({ n, title, action, children }: { n: number; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id={`step-${n}`} className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden>
            {n}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CheckoutForm({
  cart,
  addresses,
  holder,
  phone,
  realPayments,
}: {
  cart: Cart;
  addresses: Address[];
  holder: string;
  phone: string | null;
  /** Online payments go through Xendit's payment page (in its test mode); otherwise they're simulated */
  realPayments: boolean;
}) {
  const router = useRouter();
  // Made once per visit: if "Place order" is clicked twice or the request is retried,
  // the server sees the same key and won't create a second order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [fulfillment, setFulfillment] = useState<Fulfillment>("DELIVERY");
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  // Each store chooses the ways to pay it takes; one payment covers the cart, so every store must take it
  const refusedBy = (choice: PayChoice) => cart.groups.find((g) => !takes(g.store, choice))?.store.name ?? null;
  const [pay, setPay] = useState<PayChoice>(() => PAYMENT_OPTIONS.find((o) => !refusedBy(o.value))?.value ?? "COD");
  const paymentMethod: PaymentMethod = pay === "COD" ? "COD" : "ONLINE";
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  // Leaving for Xendit's payment page: a short cover so the jump to another site isn't a surprise
  const [leaving, setLeaving] = useState(false);
  // Coming back with the browser's Back button shows this page from memory: take the cover off again
  useEffect(() => {
    const restored = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setLeaving(false);
      setPlacing(false);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);
  const [error, setError] = useState<string>();

  const stores = cart.groups.length;

  // Now or later. A store that's closed right now can only take an order for later.
  const closedNow = cart.groups.filter((g) => !g.store.isOpen).map((g) => g.store.name);
  const [now] = useState(() => new Date());
  const days = useMemo(() => scheduleDays(cart.groups.map((g) => g.store), fulfillment, now), [cart.groups, fulfillment, now]);
  const [laterChosen, setLater] = useState(closedNow.length > 0);
  const later = laterChosen || closedNow.length > 0;
  const [picked, setPicked] = useState<string | null>(null);
  const times = days.flatMap((d) => d.times);
  // The picked time while it still fits (Delivery and Pickup allow different times), else the first one
  const scheduledFor = later ? (times.find((t) => t.iso === picked)?.iso ?? times[0]?.iso ?? null) : null;

  // Each store's fee follows its distance to the chosen address, and the rush hour at the time it's
  // delivered: price it again when either changes
  const [quoteKey, setQuoteKey] = useState(0);
  const delivery = fulfillment === "DELIVERY" && Boolean(addressId);
  const requote = delivery && (addressId !== cart.delivery.addressId || scheduledFor !== null);
  const quoteUrl = requote ? `/cart?addressId=${addressId}${scheduledFor ? `&at=${encodeURIComponent(scheduledFor)}` : ""}` : null;
  const { data: quoted } = useApiData<{ cart: Cart }>(quoteUrl, quoteKey);
  const priced = !requote
    ? cart
    : quoted?.cart.delivery.addressId === addressId && (quoted.cart.delivery.pricedFor ?? null) === scheduledFor
      ? quoted.cart
      : null;
  const quoteOf = (storeId: string) => priced?.groups.find((g) => g.store.id === storeId)?.delivery ?? null;
  const deliveryTotal = fulfillment === "DELIVERY" ? (priced?.delivery.total ?? 0) : 0;
  const total = cart.itemsTotal + deliveryTotal;

  async function placeOrder() {
    setPlacing(true);
    setError(undefined);
    const result = await apiRequest<{ checkoutId: string; orderIds: string[]; paymentUrl?: string | null }>("/checkout", {
      method: "POST",
      body: {
        idempotencyKey,
        fulfillment,
        addressId: fulfillment === "DELIVERY" ? addressId : undefined,
        paymentMethod,
        onlineMethod: pay === "COD" ? undefined : pay,
        notes,
        scheduledFor: scheduledFor ?? undefined,
        expectedDeliveryFee: deliveryTotal,
        simulatePaymentFailure: paymentMethod === "ONLINE" && !realPayments && simulateFailure,
      },
    });
    if (!result.ok) {
      setPlacing(false);
      setError(result.fieldErrors?.addressId?.[0] ?? result.error);
      router.refresh(); // the fee or the cart may have changed
      setQuoteKey((k) => k + 1);
      return;
    }
    const { orderIds, paymentUrl } = result.data;
    // Card or e-wallet: pay on Xendit's secure page, which brings the resident back to Feasto after.
    // The button keeps spinning while the browser leaves.
    if (paymentUrl) {
      setLeaving(true);
      window.location.assign(paymentUrl);
      return;
    }
    const names = cart.groups.map((g) => g.store.name);
    const storesText = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    // Chef Feasto pops up and stays while the app moves on to the order
    const wallet = PAYMENT_OPTIONS.find((o) => o.value === pay)?.name ?? "online";
    celebrate(
      scheduledFor
        ? {
            title: orderIds.length === 1 ? "Order scheduled!" : `${orderIds.length} orders scheduled!`,
            message: `${fulfillment === "DELIVERY" ? "Arriving" : "Ready for pickup"} ${whenInSentence(scheduledFor)}. ${storesText} ${
              stores > 1 ? "get" : "gets"
            } it at ${clockOf(sendAtOf(scheduledFor, fulfillment))}.${paymentMethod === "ONLINE" ? ` We're confirming your ${wallet} payment now.` : ""}`,
            duration: 4200,
          }
        : {
            title: orderIds.length === 1 ? "Order placed!" : `${orderIds.length} orders placed!`,
            message:
              paymentMethod === "ONLINE"
                ? `We're confirming your ${wallet} payment. ${storesText} will get the order once it's through.`
                : `${storesText} got your order. We'll tell you as soon as it's accepted.`,
            duration: 3800,
          },
    );
    router.replace(orderIds.length === 1 ? `/resident/orders/${orderIds[0]}` : "/resident/orders");
  }

  return (
    // Big screens: the steps on the left, the summary and "Place order" beside them
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
    <div className="min-w-0 space-y-7">
      <Step n={1} title="How do you want it?">
        <SegmentedControl
          name="fulfillment"
          legend="Delivery or pickup"
          value={fulfillment}
          onChange={setFulfillment}
          options={[
            { value: "DELIVERY", label: "Delivery", Icon: Bike },
            { value: "PICKUP", label: "Pickup", Icon: Store },
          ]}
        />
      </Step>

      {fulfillment === "DELIVERY" ? (
        <Step
          n={2}
          title="Deliver to"
          action={
            <Link href="/resident/addresses" className="text-sm font-semibold text-brand-700 hover:underline">
              {addresses.length ? "Manage" : "Add address"}
            </Link>
          }
        >
          {addresses.length === 0 ? (
            <Alert tone="pending">Add a delivery address first, or choose Pickup.</Alert>
          ) : (
            <div className="space-y-2">
              {addresses.map((a) => (
                <Choice
                  key={a.id}
                  name="address"
                  checked={addressId === a.id}
                  onChange={() => setAddressId(a.id)}
                  title={a.label}
                  text={[a.details, a.landmark].filter(Boolean).join(" · ")}
                  Icon={MapPin}
                />
              ))}
              {addresses.find((a) => a.id === addressId)?.latitude == null && (
                <Alert tone="pending">
                  This address has no map pin, so the rider will have to find it from the text.{" "}
                  <Link href="/resident/addresses" className="font-semibold underline">
                    Pin it on the map
                  </Link>{" "}
                  for live tracking and directions.
                </Alert>
              )}
            </div>
          )}
        </Step>
      ) : (
        <Step n={2} title={stores > 1 ? "Pick up at these stores" : "Pick up at"}>
          <ul className="space-y-2">
            {cart.groups.map((g) => (
              <li key={g.store.id} className="flex items-start gap-3 rounded-xl border border-line p-3.5">
                <Store className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">{g.store.name}</span>
                  <span className="block text-sm text-muted">{g.store.address}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">
            {stores > 1 ? "Each store tells you when its part is ready." : "We'll tell you when it's ready."} No delivery fee.
          </p>
        </Step>
      )}

      <Step n={3} title="When do you want it?">
        <WhenPicker
          days={days}
          later={later}
          onLater={setLater}
          value={scheduledFor}
          onChange={setPicked}
          fulfillment={fulfillment}
          storeNames={cart.groups.map((g) => g.store.name)}
          closedNow={closedNow}
        />
      </Step>

      <Step n={4} title="Payment">
        <PaymentPicker
          realPayments={realPayments}
          value={pay}
          onChange={setPay}
          refusedBy={refusedBy}
          total={total}
          holder={holder}
          phone={phone}
          delivery={fulfillment === "DELIVERY"}
          parts={cart.groups.map((g) => ({ store: g.store.name, amount: g.subtotal + (fulfillment === "DELIVERY" ? (quoteOf(g.store.id)?.fee ?? 0) : 0) }))}
        />
        {paymentMethod === "ONLINE" && !realPayments && (
          <div className="mt-3">
            <SwitchField
              label="Demo: make the payment fail"
              description="Shows the system cancelling the order and restoring stock."
              checked={simulateFailure}
              onChange={setSimulateFailure}
            />
          </div>
        )}
      </Step>

      <Step
        n={5}
        title="Your order"
        action={
          <Link href="/resident/cart" className="text-sm font-semibold text-brand-700 hover:underline">
            Edit
          </Link>
        }
      >
        <div className="space-y-3">
          {cart.groups.map((g) => (
            <div key={g.store.id} className="rounded-2xl border border-line">
              <p className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">{g.store.name}</p>
              <ul className="divide-y divide-line px-4">
                {g.items.map((item) => (
                  <li key={item.menuItemId} className="flex items-center gap-3 py-2.5 text-sm">
                    <DishPhoto src={item.imageUrl} sizes="40px" className="size-10 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1 text-ink">
                      <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.name}
                      {item.note && <span className="mt-0.5 block text-[13px] text-amber-800">“{item.note}”</span>}
                    </span>
                    <span className="shrink-0 text-ink tabular-nums">{formatPeso(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <TextareaField
            label={fulfillment === "DELIVERY" ? `Note for the ${stores > 1 ? "stores" : "store"} and rider` : `Note for the ${stores > 1 ? "stores" : "store"}`}
            hint={stores > 1 || fulfillment === "DELIVERY" ? "Everyone working on this order sees it." : undefined}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={fulfillment === "DELIVERY" ? "Optional, e.g. No onions. Please call when outside." : "Optional, e.g. No onions please."}
            maxLength={200}
            rows={2}
          />
        </div>
      </Step>

    </div>

    <div className="mt-7 space-y-4 lg:sticky lg:top-24 lg:mt-0">
      <section aria-label="Summary" className="rounded-2xl border border-line bg-white p-4">
        <ul className="space-y-1.5 text-[15px]">
          <li className="flex justify-between gap-3">
            <span className="text-muted">{fulfillment === "DELIVERY" ? "Arrives" : "Ready"}</span>
            <span className="text-right font-medium text-ink">{scheduledFor ? whenOf(scheduledFor) : later ? "Choose a time" : "As soon as possible"}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-muted">Items ({cart.itemCount})</span>
            <span className="text-ink tabular-nums">{formatPeso(cart.itemsTotal)}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-muted">{fulfillment === "DELIVERY" && stores > 1 ? `Delivery (${stores} stores)` : "Delivery"}</span>
            <span className="text-ink tabular-nums">
              {fulfillment !== "DELIVERY" ? "Free" : priced ? formatPeso(deliveryTotal) : "Working it out…"}
            </span>
          </li>
          {fulfillment === "DELIVERY" && priced && (
            <li className="space-y-2 rounded-xl bg-canvas px-3 py-2.5">
              {cart.groups.map((g) => {
                const quote = quoteOf(g.store.id);
                return quote ? <DeliveryFeeLine key={g.store.id} storeName={stores > 1 ? g.store.name : undefined} quote={quote} /> : null;
              })}
            </li>
          )}
        </ul>
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-lg font-bold text-ink">
          <span>Total</span>
          <span>{formatPeso(total)}</span>
        </div>
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="sticky bottom-[calc(var(--tabbar-h)+1rem+env(safe-area-inset-bottom))]">
        <Button
          className="w-full shadow-lg"
          loading={placing}
          disabled={(fulfillment === "DELIVERY" && (!addressId || !priced)) || (later && !scheduledFor)}
          onClick={placeOrder}
        >
          {placing
            ? realPayments && paymentMethod === "ONLINE"
              ? "Opening the payment page…"
              : later
                ? "Scheduling…"
                : "Placing order…"
            : realPayments && paymentMethod === "ONLINE"
              ? `Continue to payment · ${formatPeso(total)}`
              : `${later ? "Schedule order" : "Place order"} · ${formatPeso(total)}`}
        </Button>
      </div>
      {leaving && (
        <div role="status" className="fx-backdrop fixed inset-0 z-50 flex items-center justify-center bg-white/85 px-6 backdrop-blur-sm">
          <div className="fx-pop-in w-full max-w-xs rounded-3xl border border-line bg-white p-6 text-center shadow-2xl">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <ShieldCheck className="size-7" aria-hidden />
            </span>
            <p className="mt-4 font-semibold text-ink">Opening the secure payment page</p>
            <p className="mt-1 text-sm text-muted">You&apos;ll pay {formatPeso(total)} on Xendit, then come back to Feasto.</p>
            <LoaderCircle className="mx-auto mt-4 size-5 animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden />
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
