"use client";

import { AlertTriangle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatDateTime, formatPeso } from "@/lib/format";
import type { OrderIssue } from "@/lib/types";

export const ISSUE_WORDS: Record<OrderIssue["kind"], string> = {
  MISSING_ITEM: "Something was missing",
  WRONG_ITEM: "Wrong item",
  DAMAGED: "Spilled or damaged",
  COLD_OR_LATE: "Cold or very late",
  OTHER: "Something else",
};

type Item = { id: string; name: string; quantity: number; unitPrice: string; discount?: string | null };

/**
 * The customer says something was wrong after it arrived. The store answers first: give some or
 * all of it back (taken from what the store is paid), or say why not. Turned down, the customer can
 * ask Feasto, and then the admin decides.
 */
export function IssueAnswers({ orderId, issues, items, food, cash }: { orderId: string; issues: OrderIssue[]; items: Item[]; food: number; cash: boolean }) {
  if (!issues.length) return null;
  return (
    <section aria-label="Problems the customer reported" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
      <p className="flex items-center gap-2 font-semibold text-amber-900">
        <AlertTriangle className="size-5" aria-hidden />
        The customer reported a problem
      </p>
      {issues.map((i) => (
        <IssueCard key={i.id} orderId={orderId} issue={i} items={items} food={food} cash={cash} />
      ))}
    </section>
  );
}

function IssueCard({ orderId, issue, items, food, cash }: { orderId: string; issue: OrderIssue; items: Item[]; food: number; cash: boolean }) {
  const router = useRouter();
  const picked = items.filter((x) => issue.itemIds.includes(x.id));
  const limit = Math.min(food, picked.length ? picked.reduce((n, x) => n + Number(x.unitPrice) * x.quantity - Number(x.discount ?? 0), 0) : food);
  const [amount, setAmount] = useState(limit.toFixed(2));
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"REFUND" | "REJECT" | null>(null);
  const [error, setError] = useState<string>();
  const waiting = issue.status === "OPEN" && !issue.escalatedAt;

  async function decide(decision: "REFUND" | "REJECT") {
    setBusy(decision);
    setError(undefined);
    const body = decision === "REFUND" ? { decision, amount: Number(amount), answer: answer || undefined } : { decision, answer };
    const result = await apiRequest(`/vendor/orders/${orderId}/issues/${issue.id}`, { method: "POST", body });
    setBusy(null);
    if (!result.ok) return setError(result.fieldErrors?.answer?.[0] ?? result.fieldErrors?.amount?.[0] ?? result.error);
    toast.success(decision === "REFUND" ? "Given back" : "Answer sent", decision === "REFUND" ? `It's added to what your store pays Feasto.` : "The customer sees your reason.");
    router.refresh();
  }

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-line">
      <div className="flex gap-3">
        <a href={issue.photoUrl} target="_blank" rel="noreferrer" className="relative block size-20 shrink-0 overflow-hidden rounded-lg bg-canvas">
          <Image src={issue.photoUrl} alt="The customer's photo of the problem" fill unoptimized className="object-cover" />
        </a>
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-ink">{ISSUE_WORDS[issue.kind]}</p>
          <p className="text-muted">“{issue.note}”</p>
          {picked.length > 0 && <p className="mt-0.5 text-[0.8125rem] text-ink">About: {picked.map((x) => `${x.quantity}× ${x.name}`).join(", ")}</p>}
          <p className="mt-0.5 text-xs text-muted">{formatDateTime(issue.createdAt)}</p>
        </div>
      </div>
      {waiting ? (
        <div className="mt-3 space-y-2">
          <TextField
            label={`Give back (up to ${formatPeso(limit)})`}
            hint={cash ? "Paid in cash: the customer gets Suki points worth this. It's added to what you owe Feasto." : "Paid online: refunded to how they paid. It's taken from your store's share."}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TextField label="Message to the customer" hint="Needed to say no. Optional when giving back." value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={300} />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" loading={busy === "REJECT"} disabled={busy !== null} onClick={() => decide("REJECT")}>
              Say no
            </Button>
            <Button loading={busy === "REFUND"} disabled={busy !== null || !(Number(amount) > 0)} onClick={() => decide("REFUND")}>
              Give back {Number(amount) > 0 ? formatPeso(Number(amount)) : ""}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm font-medium">
          {issue.status === "OPEN" && <span className="text-amber-800">The customer asked Feasto to look. The admin decides now.</span>}
          {issue.status === "RESOLVED" && (
            <span className="text-emerald-700">
              {formatPeso(Number(issue.amount))} given back ({issue.given === "credit" ? "Suki points" : "refund"}){issue.paidBy === "FEASTO" ? ", paid by Feasto" : ""}.
            </span>
          )}
          {issue.status === "REJECTED" && <span className="text-red-700">Turned down{issue.escalatedAt ? " by Feasto" : ""}: “{issue.answer}”</span>}
        </p>
      )}
    </div>
  );
}
