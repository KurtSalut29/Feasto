"use client";

import { CreditCard, ShieldCheck, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { celebrate } from "@/components/app/celebrate";
import { PAYMENT_OPTIONS, PaymentLogo } from "@/components/app/payment-brands";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import type { OnlinePayment, PaymentStatus } from "@/lib/types";

/** E-wallets first, then cards */
const WAYS = PAYMENT_OPTIONS.filter((o) => o.value !== "COD");

type Who = "store" | "rider";
const api = (who: Who) => (who === "store" ? "/vendor/earnings" : "/rider/earnings");

/**
 * Pay what you owe Feasto from cash orders, in the app, with an e-wallet or card. With Xendit
 * (`real`), it opens Xendit's payment page, made by Feasto's own account: nobody types where the
 * money goes, so it can only reach Feasto. It's counted once Xendit confirms the money arrived
 * (see FeastoPaymentReturn). It asks for the amount it showed: if a cash order finished in between,
 * the server says so instead of charging a different amount.
 */
export function PayFeastoButton({ owed, orders, who, real = false, className = "" }: { owed: number; orders: number; who: Who; real?: boolean; className?: string }) {
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
    const result = await apiRequest<{ paymentUrl?: string; method?: string }>(`${api(who)}/pay`, { method: "POST", body: { method: way, expected: owed } });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    // On to Xendit's page; it sends them back here with the result. Stays busy until the page goes.
    if (result.data.paymentUrl) return window.location.assign(result.data.paymentUrl);
    setBusy(false);
    setOpen(false);
    celebrate({ title: `Paid ${amount}`, message: `Paid with ${result.data.method}. You owe Feasto nothing now. Salamat!` });
    router.refresh();
  }

  const things = orders === 1 ? (who === "store" ? "order" : "delivery") : who === "store" ? "orders" : "deliveries";
  return (
    <>
      <Button className={`h-10 px-4 text-sm ${className}`} onClick={() => setOpen(true)}>
        <Wallet className="size-4" aria-hidden />
        Pay {amount}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Pay Feasto" description={`Feasto's share of your ${orders} cash ${things}.`}>
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
        {real ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            <span>
              You&apos;ll pay on Xendit&apos;s secure page, straight to Feasto&apos;s account. There&apos;s no number to type, so it can&apos;t go to the wrong person. Test mode: no real money
              moves.
            </span>
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted">Payments in Feasto are simulated for this project; no real money moves.</p>
        )}
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
            {real ? `Continue to pay with ${wayName}` : `Pay ${amount} with ${wayName}`}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

type Result = { status: PaymentStatus; amount: string; method: string; paymentUrl: string | null; reason: string | null };

/** How often to ask while Xendit confirms, and when to offer the way back to the payment page */
const EVERY_MS = 2000;
const SLOW_AFTER_MS = 20_000;

/**
 * Xendit's page sends the store or rider back with ?feasto-payment=<id>. This asks Feasto (which
 * asks Xendit) how it went, every two seconds until it's settled: paid, a celebration; not paid,
 * why, and the way back to the payment page.
 */
export function FeastoPaymentReturn({ who }: { who: Who }) {
  return (
    <Suspense fallback={null}>
      <PaymentReturn who={who} />
    </Suspense>
  );
}

function PaymentReturn({ who }: { who: Who }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = params.get("feasto-payment");
  const backedOut = params.get("result") === "failed";
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState<string>();
  const [slow, setSlow] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    if (!id) return;
    started.current = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      const answer = await apiRequest<Result>(`${api(who)}/payments/${encodeURIComponent(id!)}`);
      if (stopped) return;
      if (!answer.ok) return setError(answer.error);
      setResult(answer.data);
      if (answer.data.status === "PENDING") {
        if (Date.now() - started.current > SLOW_AFTER_MS) setSlow(true);
        timer = setTimeout(check, EVERY_MS);
      }
    }
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, who]);

  // Closes at once; the address loses ?feasto-payment while the page reloads behind it
  const [dismissed, setDismissed] = useState<string | null>(null);
  const close = () => {
    setDismissed(id);
    router.replace(pathname, { scroll: false });
  };

  // Paid: celebrate, and show the balance at ₱0
  useEffect(() => {
    if (result?.status !== "PAID") return;
    celebrate({ title: `Paid ${formatPeso(result.amount)}`, message: `Feasto received it through ${result.method}. Salamat!`, duration: 3200 });
    router.replace(pathname, { scroll: false });
    router.refresh();
  }, [result, router, pathname]);

  if (!id || result?.status === "PAID" || dismissed === id) return null;

  const waiting = !error && (!result || (result.status === "PENDING" && !backedOut && !slow));
  const title = error ? "We couldn't find this payment" : waiting ? "Confirming your payment…" : result?.status === "PENDING" ? "Your payment isn't finished" : "Your payment didn't go through";
  const text = error
    ? error
    : waiting
      ? "Xendit is telling Feasto how your payment went. This takes a few seconds."
      : result?.status === "PENDING"
        ? `Nothing was paid yet. You still owe ${formatPeso(result.amount)}: go back to the payment page to finish, or pay later.`
        : `${result?.reason ?? "It wasn't completed"}. You weren't charged. You can try again with Pay.`;

  return (
    <Dialog open onClose={close} title={title} description={text}>
      {waiting && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted">
          <span className="size-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 motion-reduce:animate-none" aria-hidden />
          Checking with Xendit…
        </p>
      )}
      {/* Phones: full-width buttons, the main one on top. Bigger screens: one row, main one last. */}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={close}>
          {waiting ? "Close" : result?.paymentUrl ? "Pay later" : "OK"}
        </Button>
        {!waiting && result?.paymentUrl && (
          <a href={result.paymentUrl} className={buttonClass()}>
            <CreditCard className="size-5" aria-hidden />
            Go back to the payment page
          </a>
        )}
      </div>
    </Dialog>
  );
}
