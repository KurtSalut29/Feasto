"use client";

import { CircleAlert, CircleCheck, Clock, Landmark, Pencil, Plus, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { apiRequest } from "@/lib/browser-api";
import { formatDate, formatPeso } from "@/lib/format";
import type { Payout, PayoutAccount, PayoutChannel, PayoutsData, PayoutStatus } from "@/lib/types";

export const PAYOUT_LABEL: Record<PayoutChannel, string> = {
  GCASH: "GCash",
  MAYA: "Maya",
  BDO: "BDO",
  BPI: "BPI",
  METROBANK: "Metrobank",
  LANDBANK: "Landbank",
  UNIONBANK: "UnionBank",
  SECURITY_BANK: "Security Bank",
};
const isWallet = (c: PayoutChannel) => c === "GCASH" || c === "MAYA";
const CHANNEL_OPTIONS = (Object.keys(PAYOUT_LABEL) as PayoutChannel[]).map((c) => ({ value: c, label: `${PAYOUT_LABEL[c]} · ${isWallet(c) ? "e-wallet" : "bank"}` }));

const STATUS: Record<PayoutStatus, { label: string; tone: BadgeTone }> = {
  SENT: { label: "Sent", tone: "success" },
  SENDING: { label: "On the way", tone: "info" },
  PENDING: { label: "On the way", tone: "info" },
  NEEDS_ACCOUNT: { label: "Waiting for your account", tone: "warning" },
  FAILED: { label: "Didn't go through", tone: "danger" },
};

/** "Xendit · test mode" or "simulated": how real the money is, said every time it's shown */
export const payoutsNote = (mode: PayoutsData["mode"]) =>
  mode === "xendit" ? "Sent through Xendit Payouts · test mode, no real money moves" : "Simulated for this project · no real money moves";

/**
 * A store's or rider's money from online orders: where Feasto sends it, and each payout with its
 * status. Online payments land in Feasto's Xendit account; when an order is delivered or collected,
 * their share is sent from there to their GCash, Maya or bank.
 */
export function PayoutsCard({ who, data }: { who: "store" | "rider"; data: PayoutsData }) {
  const { account, payouts, totals, mode } = data;
  const [editing, setEditing] = useState(false);
  const base = who === "store" ? "/vendor" : "/rider";
  const job = who === "store" ? "order" : "delivery";

  return (
    <Card
      title="Money sent to you"
      Icon={Send}
      accent="emerald"
      description={`Your share of each online ${job}, sent when it's ${who === "store" ? "delivered or collected" : "delivered"}`}
      footer={
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          {payoutsNote(mode)}
        </p>
      }
    >
      <div id="payout" className="scroll-mt-24 border-b border-line px-5 py-4">
        {account ? (
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted ring-1 ring-line">
              <Landmark className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Sent to</p>
              <p className="truncate font-semibold text-ink">
                {PAYOUT_LABEL[account.channel]} ••{account.number.slice(-4)}
              </p>
              <p className="truncate text-xs text-muted">{account.name}</p>
            </div>
            <Button variant="secondary" className="h-8! shrink-0 gap-1.5! px-2.5! text-[0.8125rem]!" aria-label="Change where Feasto sends your money" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden />
              Change
            </Button>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 p-3.5 text-amber-900">
            <p className="text-sm font-semibold">Add where Feasto sends your money</p>
            <p className="mt-0.5 text-sm">
              {totals.held > 0
                ? `${formatPeso(totals.held)} from ${totals.heldCount} online ${totals.heldCount === 1 ? job : `${job === "order" ? "orders" : "deliveries"}`} is waiting for you. It's sent the moment you add your GCash, Maya or bank account.`
                : "Your GCash, Maya or bank account. Your share of online orders is sent there automatically."}
            </p>
            <Button className="mt-3 h-9! px-3! text-sm!" onClick={() => setEditing(true)}>
              <Plus className="size-4" aria-hidden />
              Add account
            </Button>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 divide-x divide-line border-b border-line text-center">
        <div className="px-3 py-3">
          <dt className="text-xs text-muted">Sent to you</dt>
          <dd className="mt-0.5 font-semibold text-emerald-700 tabular-nums">{formatPeso(totals.sent)}</dd>
        </div>
        <div className="px-3 py-3">
          <dt className="text-xs text-muted">{totals.failed > 0 ? "Didn't go through" : "On the way"}</dt>
          <dd className={`mt-0.5 font-semibold tabular-nums ${totals.failed > 0 ? "text-red-700" : "text-ink"}`}>
            {formatPeso(totals.failed > 0 ? totals.failed : totals.onTheWay + totals.held)}
          </dd>
        </div>
      </dl>

      {payouts.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted">Nothing sent yet. Your share of the next online {job} shows here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {payouts.map((p) => (
            <PayoutRow key={p.id} payout={p} retryPath={`${base}/payouts/${p.id}/retry`} />
          ))}
        </ul>
      )}

      {/* While money is on its way, check every few seconds so "Sent" shows without reloading */}
      {totals.onTheWayCount > 0 && <AutoRefresh everyMs={8000} />}
      <AccountDialog open={editing} onClose={() => setEditing(false)} account={account ?? null} path={`${base}/payouts/account`} />
    </Card>
  );
}

/** One payout: the order, the amount, where it went, and what happened */
export function PayoutRow({ payout: p, retryPath, retryBody = {}, showWho = false }: { payout: Payout; retryPath?: string; retryBody?: object; showWho?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const status = STATUS[p.status];
  // Just turned Sent while the page was open: the check pops in and draws itself
  const [shownStatus, setShownStatus] = useState(p.status);
  const [justSent, setJustSent] = useState(false);
  if (shownStatus !== p.status) {
    setShownStatus(p.status);
    setJustSent(p.status === "SENT");
  }
  const Icon = p.status === "SENT" ? CircleCheck : p.status === "FAILED" ? CircleAlert : Clock;
  const tint = p.status === "SENT" ? "text-emerald-600" : p.status === "FAILED" ? "text-red-600" : p.status === "NEEDS_ACCOUNT" ? "text-amber-600" : "text-sky-600";

  async function retry() {
    if (!retryPath) return;
    setBusy(true);
    const result = await apiRequest(retryPath, { method: "POST", body: retryBody });
    setBusy(false);
    if (!result.ok) return toast.error("Couldn't send it again", result.error);
    toast.success(`Sending ${formatPeso(p.amount)} again`);
    router.refresh();
  }

  return (
    <li className="flex gap-3 px-5 py-3">
      <Icon key={p.status} onAnimationEnd={(e) => e.animationName === "fx-draw" && setJustSent(false)} className={`mt-0.5 size-5 shrink-0 ${tint} ${justSent ? "fx-pop-in fx-draw" : ""}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-ink">
            {showWho ? `${p.to} · ` : ""}
            {p.orderCode}
          </p>
          <p className="shrink-0 font-semibold text-ink tabular-nums">{formatPeso(p.amount)}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span key={p.status} className={justSent ? "fx-pop-in" : ""}>
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
          {p.account && <span>{p.account}</span>}
          <span>{formatDate(p.sentAt ?? p.createdAt)}</span>
        </div>
        {p.reference && <p className="mt-1 truncate font-mono text-[0.6875rem] text-gray-500">Xendit ref {p.reference}</p>}
        {p.status === "FAILED" && p.failure && <p className="mt-1 text-xs text-red-700">{p.failure}</p>}
        {p.status === "FAILED" && retryPath && (
          <Button variant="secondary" loading={busy} className="mt-2 h-8! px-3! text-xs!" onClick={retry}>
            <RotateCcw className="size-3.5" aria-hidden />
            Send again
          </Button>
        )}
      </div>
    </li>
  );
}

/** Choose the e-wallet or bank, the name on it and its number */
function AccountDialog({ open, onClose, account, path }: { open: boolean; onClose: () => void; account: PayoutAccount | null; path: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState<PayoutChannel | "">(account?.channel ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [number, setNumber] = useState(account?.number ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const wallet = channel ? isWallet(channel) : true;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setFields({});
    const result = await apiRequest<{ resent: number }>(path, { method: "PUT", body: { channel, name, number } });
    setBusy(false);
    if (!result.ok) {
      const f = result.fieldErrors;
      if (f && Object.keys(f).length) setFields(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v?.[0] ?? ""])));
      else setError(result.error);
      return;
    }
    onClose();
    toast.success("Account saved", result.data.resent ? `Sending ${result.data.resent === 1 ? "the payout that was waiting" : `the ${result.data.resent} payouts that were waiting`} now.` : "Your next payout goes there.");
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title={account ? "Change where we send your money" : "Where should Feasto send your money?"} description="Your share of online orders is sent here as soon as each one is finished.">
      <form onSubmit={save} className="mt-4 space-y-4" noValidate>
        <SelectField label="E-wallet or bank" placeholder="Choose one" options={CHANNEL_OPTIONS} value={channel} onChange={(e) => setChannel(e.target.value as PayoutChannel)} error={fields.channel} required />
        <TextField label="Account name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" error={fields.name} hint="The name on the account, exactly as GCash or the bank has it." required />
        <TextField
          label={wallet ? "Mobile number" : "Account number"}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder={wallet ? "09171234567" : "10 to 16 digits"}
          error={fields.number}
          required
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!channel}>
            Save account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
