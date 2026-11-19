"use client";

import { CircleCheck, CircleX, Copy, Hourglass, Landmark, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentPicker, uploadDocument } from "@/components/app/document-upload";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import type { PaymentStatus, ReceivingAccount, SavedPayMethod } from "@/lib/types";

type Transfer = {
  checkoutId: string;
  amount: number;
  to: string;
  ref: string | null;
  from: string | null;
  sentAt: string | null;
  checkedAt: string | null;
  note: string | null;
  hasProof: boolean;
  status: PaymentStatus;
  stores: string[];
  orders: { id: string; status: string }[];
  account: ReceivingAccount;
  sendBy: string;
};

/** "12:05" left to send it */
function left(until: number) {
  const s = Math.max(0, Math.round((until - Date.now()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function CopyButton({ text, what }: { text: string; what: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => toast.success(`${what} copied`),
          () => toast.error("Couldn't copy", "Select it and copy it yourself."),
        );
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <Copy className="size-3.5" aria-hidden />
      Copy
    </button>
  );
}

/**
 * Paying by transfer to Feasto's own account, in three steps: send exactly the amount to the account
 * shown (or scan its QR), upload the receipt, and type its reference number and the account it came
 * from. Then the admin finds it in the account's history; this page updates by itself when they do.
 */
export function TransferSteps({ checkoutId, me, saved }: { checkoutId: string; me: { name: string; phone: string | null }; saved: SavedPayMethod[] }) {
  const [transfer, setTransfer] = useState<Transfer>();
  const [loadError, setLoadError] = useState<string>();
  const [, tick] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState("");
  const [fromName, setFromName] = useState(me.name);
  const [fromNumber, setFromNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  const prefilled = useRef(false);

  const load = useCallback(async () => {
    const result = await apiRequest<{ transfer: Transfer }>(`/transfers/${checkoutId}`);
    if (!result.ok) return setLoadError(result.error);
    const t = result.data.transfer;
    setTransfer(t);
    // The account it's likely sent from: their saved one of the same kind, else their phone
    if (!prefilled.current) {
      prefilled.current = true;
      const same = saved.find((m) => m.kind === t.account.channel);
      if (same?.number) {
        setFromNumber(same.number);
        setFromName(same.holderName);
      } else if (t.account.channel !== "BANK" && me.phone) setFromNumber(me.phone);
    }
  }, [checkoutId, saved, me.phone]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  // The countdown, and a fresh look every few seconds while the admin checks it
  const waiting = transfer?.status === "PENDING";
  useEffect(() => {
    if (!waiting) return;
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    const poll = transfer?.sentAt ? setInterval(() => void load(), 5000) : undefined;
    return () => {
      clearInterval(clock);
      if (poll) clearInterval(poll);
    };
  }, [waiting, transfer?.sentAt, load]);

  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!transfer) return <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" aria-busy="true" />;

  const { account } = transfer;
  const bank = account.channel === "BANK";
  const orderHref = transfer.orders.length === 1 ? `/resident/orders/${transfer.orders[0].id}` : "/resident/orders";
  const deadline = new Date(transfer.sendBy).getTime();

  async function send() {
    const problems: Record<string, string> = {};
    if (!file) problems.proof = "Add a screenshot of the receipt.";
    if (!ref.trim()) problems.ref = "Enter the reference number from the receipt.";
    if (!fromNumber.trim()) problems.fromNumber = bank ? "Enter the account you sent from." : "Enter the mobile number you sent from.";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      await uploadDocument(file!, `/api/transfers/${checkoutId}/proof`);
      const result = await apiRequest(`/transfers/${checkoutId}/sent`, { method: "POST", body: { ref, fromName, fromNumber } });
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        if (!result.fieldErrors) toast.error("Couldn't send it", result.error);
        return;
      }
      toast.success("Sent to Feasto", "We'll tell you as soon as your payment is confirmed.");
      await load();
    } catch (error) {
      setErrors({ proof: error instanceof Error ? error.message : "Upload failed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  // ---------- Settled ----------
  if (transfer.status === "PAID") {
    return (
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center">
        <CircleCheck className="mx-auto size-10 text-emerald-600" aria-hidden />
        <h2 className="mt-2 text-lg font-semibold text-ink">Payment confirmed</h2>
        <p className="mt-1 text-sm text-muted">
          Feasto found your {formatPeso(transfer.amount)} transfer. {transfer.stores.join(" and ")} {transfer.stores.length > 1 ? "have" : "has"} your order now.
        </p>
        <ButtonLink href={orderHref} className="mt-4 w-full">
          See your order
        </ButtonLink>
      </section>
    );
  }
  if (transfer.status !== "PENDING") {
    return (
      <section className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
        <CircleX className="mx-auto size-10 text-red-600" aria-hidden />
        <h2 className="mt-2 text-lg font-semibold text-ink">{transfer.note ? "Feasto couldn't confirm your transfer" : "This order was cancelled"}</h2>
        <p className="mt-1 text-sm text-muted">
          {transfer.note ?? "The transfer wasn't sent in time."} If you did send money, report it from the order and the admin will check again.
        </p>
        <ButtonLink href={orderHref} variant="secondary" className="mt-4 w-full">
          See the order
        </ButtonLink>
      </section>
    );
  }
  if (transfer.sentAt) {
    return (
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="text-center">
          <Hourglass className="mx-auto size-10 text-brand-600" aria-hidden />
          <h2 className="mt-2 text-lg font-semibold text-ink">Feasto is checking your transfer</h2>
          <p className="mt-1 text-sm text-muted">The admin looks for it in Feasto&apos;s {account.label} history. Your order goes to the store once it&apos;s found. This page updates by itself.</p>
        </div>
        <dl className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
          {[
            ["Amount", formatPeso(transfer.amount)],
            ["Sent to", transfer.to],
            ["From", transfer.from ?? ""],
            ["Reference no.", transfer.ref ?? ""],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium break-all text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href={orderHref} className="mt-4 block text-center text-sm font-semibold text-brand-700 hover:underline">
          Go to your order
        </Link>
      </section>
    );
  }

  // ---------- Send it ----------
  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
        <Timer className="size-4 shrink-0" aria-hidden />
        <span>
          Send it within <span className="font-semibold tabular-nums">{left(deadline)}</span>, or the order is cancelled and the food goes back to the store.
        </span>
      </p>

      <section aria-labelledby="send-to" className="rounded-2xl border border-line bg-white p-4">
        <h2 id="send-to" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden>
            1
          </span>
          Send exactly this amount
        </h2>
        <p className="mt-3 flex items-baseline justify-between gap-3">
          <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{formatPeso(transfer.amount)}</span>
          <CopyButton text={transfer.amount.toFixed(2)} what="Amount" />
        </p>
        <dl className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-muted">{bank ? "Bank" : "Send with"}</dt>
            <dd className="flex items-center gap-1.5 font-semibold text-ink">
              {bank && <Landmark className="size-4" aria-hidden />}
              {account.label}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-muted">{bank ? "Account number" : "Mobile number"}</dt>
            <dd className="flex items-center gap-1 font-mono font-semibold tracking-wide text-ink">
              {account.shownNumber}
              <CopyButton text={account.accountNumber} what="Number" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-muted">Account name</dt>
            <dd className="text-right font-semibold text-ink">{account.accountName}</dd>
          </div>
        </dl>
        {account.qrUrl && (
          <figure className="mt-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- the admin's uploaded QR, shown as is */}
            <img src={account.qrUrl} alt={`QR code of ${account.label} ${account.shownNumber}`} className="mx-auto size-56 rounded-xl border border-line bg-white object-contain p-2" />
            <figcaption className="mt-1.5 text-xs text-muted">Or scan this in your {account.label} app</figcaption>
          </figure>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          <span>
            Check that the name {bank ? "on the account" : `in ${account.label}`} says <span className="font-semibold text-ink">{account.accountName}</span> before you send. Feasto never asks you to send to any other number.
          </span>
        </p>
      </section>

      <section aria-labelledby="receipt" className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <h2 id="receipt" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden>
            2
          </span>
          Add the receipt
        </h2>
        <DocumentPicker label="Screenshot of the receipt" hint={`The ${account.label} receipt showing the amount and the reference number.`} file={file} onChange={setFile} error={errors.proof} />
        <TextField
          label="Reference number"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={account.channel === "GCASH" ? "13 digits, after “Ref No.”" : "From the receipt"}
          inputMode={account.channel === "GCASH" ? "numeric" : "text"}
          autoComplete="off"
          hint={account.channel === "GCASH" ? "On the GCash receipt, after “Ref No.” (13 digits)." : undefined}
          error={errors.ref}
        />
      </section>

      <section aria-labelledby="from" className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <h2 id="from" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden>
            3
          </span>
          Where you sent it from
        </h2>
        <p className="text-sm text-muted">So Feasto can find it, and send it back if the order is cancelled.</p>
        <TextField label="Name on your account" value={fromName} onChange={(e) => setFromName(e.target.value)} autoComplete="name" error={errors.fromName} />
        {bank ? (
          <TextField label="Your account number (or its last 4 digits)" value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} inputMode="numeric" error={errors.fromNumber} />
        ) : (
          <TextField label={`Your ${account.label} number`} type="tel" value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} error={errors.fromNumber} />
        )}
      </section>

      <Button className="w-full" loading={busy} onClick={send}>
        I&apos;ve sent {formatPeso(transfer.amount)}
      </Button>
      <p className="text-center text-xs text-muted">The store gets your order after Feasto finds your transfer.</p>
    </div>
  );
}
