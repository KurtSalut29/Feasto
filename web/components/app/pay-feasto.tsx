"use client";

import { Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { celebrate } from "@/components/app/celebrate";
import { PAYMENT_OPTIONS, PaymentLogo } from "@/components/app/payment-brands";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import type { OnlinePayment } from "@/lib/types";

/** E-wallets first, then cards */
const WAYS = PAYMENT_OPTIONS.filter((o) => o.value !== "COD");

/**
 * Pay what you owe Feasto from cash orders, in the app, with an e-wallet or card (simulated, like
 * every online payment in Feasto). It sends the amount it showed: if a cash order finished in
 * between, the server says so instead of charging a different amount.
 */
export function PayFeastoButton({ owed, orders, who, className = "" }: { owed: number; orders: number; who: "store" | "rider"; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [way, setWay] = useState<OnlinePayment>("GCASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const amount = formatPeso(owed);
  const wayName = WAYS.find((w) => w.value === way)?.name ?? "";

  async function pay() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest<{ method: string }>(`/${who === "store" ? "vendor" : "rider"}/earnings/pay`, { method: "POST", body: { method: way, expected: owed } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    celebrate({ title: `Paid ${amount}`, message: `Paid with ${result.data.method}. You owe Feasto nothing now. Salamat!` });
    router.refresh();
  }

  return (
    <>
      <Button className={`h-10 px-4 text-sm ${className}`} onClick={() => setOpen(true)}>
        <Wallet className="size-4" aria-hidden />
        Pay {amount}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Pay Feasto" description={`Feasto's share of your ${orders} cash ${orders === 1 ? (who === "store" ? "order" : "delivery") : who === "store" ? "orders" : "deliveries"}.`}>
        <p className="mt-4 text-3xl font-bold text-ink tabular-nums">{amount}</p>
        <fieldset className="mt-4 min-w-0">
          <legend className="mb-2 text-sm font-semibold text-ink">Pay with</legend>
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {WAYS.map((option) => {
              const on = way === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex shrink-0 snap-start cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2 transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                    on ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line bg-white hover:border-gray-300"
                  }`}
                >
                  <input type="radio" name="pay-feasto" checked={on} onChange={() => setWay(option.value as OnlinePayment)} className="sr-only" />
                  <span className="flex h-8 w-14 items-center justify-center rounded-md bg-white ring-1 ring-line" aria-hidden>
                    {option.tile && <PaymentLogo file={option.tile} tint={option.brand} className="h-5 w-10" />}
                  </span>
                  <span className="text-xs font-semibold whitespace-nowrap text-ink">{option.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="mt-3 text-xs text-muted">Payments in Feasto are simulated for this project; no real money moves.</p>
        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={pay}>
            Pay {amount} with {wayName}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
