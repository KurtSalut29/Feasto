"use client";

import { Banknote, Bike, CreditCard, MapPin, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SwitchField } from "@/components/ui/switch-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/api-client";
import { formatPeso } from "@/lib/format";
import type { Address, Cart, Fulfillment, PaymentMethod } from "@/lib/types";

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

export function CheckoutForm({ cart, addresses }: { cart: Cart; addresses: Address[] }) {
  const router = useRouter();
  // Made once per visit: if "Place order" is clicked twice or the request is retried,
  // the server sees the same key and won't create a second order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [fulfillment, setFulfillment] = useState<Fulfillment>("DELIVERY");
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string>();

  const stores = cart.groups.length;
  const deliveryTotal = fulfillment === "DELIVERY" ? cart.deliveryFeePerStore * stores : 0;
  const total = cart.itemsTotal + deliveryTotal;

  async function placeOrder() {
    setPlacing(true);
    setError(undefined);
    const result = await apiRequest<{ checkoutId: string; orderIds: string[] }>("/checkout", {
      method: "POST",
      body: {
        idempotencyKey,
        fulfillment,
        addressId: fulfillment === "DELIVERY" ? addressId : undefined,
        paymentMethod,
        notes,
        simulatePaymentFailure: paymentMethod === "ONLINE" && simulateFailure,
      },
    });
    if (!result.ok) {
      setPlacing(false);
      setError(result.fieldErrors?.addressId?.[0] ?? result.error);
      return;
    }
    const { orderIds } = result.data;
    router.replace(orderIds.length === 1 ? `/resident/orders/${orderIds[0]}` : "/resident/orders");
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold text-ink">How do you want it?</h2>
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
      </section>

      {fulfillment === "DELIVERY" ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-ink">Deliver to</h2>
            <Link href="/resident/addresses" className="text-sm font-semibold text-brand-700 hover:underline">
              {addresses.length ? "Manage" : "Add address"}
            </Link>
          </div>
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
            </div>
          )}
        </section>
      ) : (
        <Alert tone="pending" title="You'll collect it yourself">
          {stores > 1 ? `Pick up from each of the ${stores} stores when they say it's ready.` : "Pick it up at the store when it's ready."} No
          delivery fee.
        </Alert>
      )}

      <section>
        <h2 className="mb-2 font-semibold text-ink">Payment</h2>
        <div className="space-y-2">
          <Choice
            name="payment"
            checked={paymentMethod === "COD"}
            onChange={() => setPaymentMethod("COD")}
            title="Cash"
            text={fulfillment === "DELIVERY" ? "Pay the rider when it arrives." : "Pay at the store."}
            Icon={Banknote}
          />
          <Choice
            name="payment"
            checked={paymentMethod === "ONLINE"}
            onChange={() => setPaymentMethod("ONLINE")}
            title="Online payment"
            text="Simulated for this project; no real money moves."
            Icon={CreditCard}
          />
        </div>
        {paymentMethod === "ONLINE" && (
          <div className="mt-3">
            <SwitchField
              label="Demo: make the payment fail"
              description="Shows the system cancelling the order and restoring stock."
              checked={simulateFailure}
              onChange={setSimulateFailure}
            />
          </div>
        )}
      </section>

      <TextareaField
        label="Notes for the store"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional, e.g. No onions please."
        maxLength={200}
        rows={2}
      />

      <section className="rounded-2xl border border-line p-4">
        <h2 className="mb-3 font-semibold text-ink">Summary</h2>
        <ul className="space-y-1.5 text-[15px]">
          {cart.groups.map((g) => (
            <li key={g.store.id} className="flex justify-between gap-3">
              <span className="truncate text-muted">{g.store.name}</span>
              <span className="text-ink">{formatPeso(g.subtotal)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3">
            <span className="text-muted">
              {fulfillment === "DELIVERY"
                ? `Delivery (${formatPeso(cart.deliveryFeePerStore)} × ${stores} ${stores === 1 ? "store" : "stores"})`
                : "Delivery"}
            </span>
            <span className="text-ink">{fulfillment === "DELIVERY" ? formatPeso(deliveryTotal) : "Free"}</span>
          </li>
        </ul>
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-lg font-bold text-ink">
          <span>Total</span>
          <span>{formatPeso(total)}</span>
        </div>
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="sticky bottom-20">
        <Button
          className="w-full shadow-lg"
          loading={placing}
          disabled={fulfillment === "DELIVERY" && !addressId}
          onClick={placeOrder}
        >
          {placing ? "Placing order…" : `Place order · ${formatPeso(total)}`}
        </Button>
      </div>
    </div>
  );
}
