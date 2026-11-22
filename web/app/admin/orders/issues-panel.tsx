"use client";

import { AlertTriangle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatDateTime, formatPeso } from "@/lib/format";

type Status = "OPEN" | "RESOLVED" | "REJECTED";
type AdminIssue = {
  id: string;
  orderId: string;
  code: string;
  label: string;
  note: string;
  photoUrl: string;
  status: Status;
  amount: number;
  paidBy: "STORE" | "FEASTO" | null;
  given: string | null;
  answer: string | null;
  escalatedAt: string | null;
  createdAt: string;
  store: string;
  rider: string | null;
  resident: string;
  paymentMethod: "COD" | "ONLINE";
  items: string[];
  limit: number | null;
};

const TABS: { key: Status; label: string }[] = [
  { key: "OPEN", label: "Open" },
  { key: "RESOLVED", label: "Given back" },
  { key: "REJECTED", label: "Turned down" },
];

/** Admin › Orders › Problems: the ones a resident sent to Feasto first, then the ones stores are still answering */
export function IssuesPanel() {
  const [status, setStatus] = useState<Status>("OPEN");
  const [key, setKey] = useState(0);
  const { data } = useApiData<{ issues: AdminIssue[]; counts: Partial<Record<Status, number>> }>(`/admin/issues?status=${status}`, key);
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Problem status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={status === t.key}
            onClick={() => setStatus(t.key)}
            className={`tap rounded-full border px-3.5 py-1.5 text-sm font-semibold ${status === t.key ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-white text-ink hover:bg-canvas"}`}
          >
            {t.label} <span className="tabular-nums text-muted">{data?.counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : data.issues.length === 0 ? (
        <EmptyState Icon={AlertTriangle} title={status === "OPEN" ? "No problems waiting" : "Nothing here yet"} text="Residents report a problem with a photo within a day of delivery. The store answers first; you decide the ones sent to Feasto." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.issues.map((i) => (
            <IssueRow key={i.id} issue={i} onDone={() => setKey((k) => k + 1)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ issue, onDone }: { issue: AdminIssue; onDone: () => void }) {
  const [amount, setAmount] = useState(issue.limit !== null ? issue.limit.toFixed(2) : "");
  const [answer, setAnswer] = useState("");
  const [paidBy, setPaidBy] = useState<"STORE" | "FEASTO">("STORE");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function decide(decision: "REFUND" | "REJECT") {
    setBusy(decision);
    setError(undefined);
    const body = decision === "REFUND" ? { decision, amount: Number(amount), paidBy, answer: answer || undefined } : { decision, answer };
    const result = await apiRequest(`/admin/issues/${issue.id}/decide`, { method: "POST", body });
    setBusy(null);
    if (!result.ok) return setError(result.fieldErrors?.answer?.[0] ?? result.error);
    toast.success(decision === "REFUND" ? "Given back" : "Turned down", "The resident and the store are told.");
    onDone();
  }

  return (
    <li className="rounded-2xl border border-line bg-white p-4">
      <div className="flex gap-3">
        <a href={issue.photoUrl} target="_blank" rel="noreferrer" className="relative block size-20 shrink-0 overflow-hidden rounded-lg bg-canvas">
          <Image src={issue.photoUrl} alt={`Photo from ${issue.resident}`} fill unoptimized className="object-cover" />
        </a>
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-ink">
            {issue.label} ·{" "}
            <Link href={`/admin/orders?q=${encodeURIComponent(issue.code)}`} className="text-brand-700 hover:underline">
              {issue.code}
            </Link>
          </p>
          <p className="text-muted">“{issue.note}”</p>
          {issue.items.length > 0 && <p className="text-[0.8125rem] text-ink">About: {issue.items.join(", ")}</p>}
          <p className="mt-0.5 text-xs text-muted">
            {issue.resident} · {issue.store}
            {issue.rider ? ` · rider ${issue.rider}` : ""} · {issue.paymentMethod === "COD" ? "cash" : "online"} · {formatDateTime(issue.createdAt)}
          </p>
          {issue.escalatedAt && issue.answer && <p className="mt-1 text-[0.8125rem] text-amber-900">The store said no: “{issue.answer}”</p>}
        </div>
      </div>
      {issue.status === "OPEN" ? (
        issue.escalatedAt ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={`Give back (up to ${formatPeso(issue.limit ?? 0)})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <fieldset>
                <legend className="mb-1 block text-sm font-medium text-ink">Who pays</legend>
                <div className="flex gap-2">
                  {(["STORE", "FEASTO"] as const).map((p) => (
                    <label key={p} className={`tap flex-1 cursor-pointer rounded-xl border px-3 py-2 text-center text-sm font-semibold has-focus-visible:ring-4 has-focus-visible:ring-brand-500/20 ${paidBy === p ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-ink"}`}>
                      <input type="radio" name={`payer-${issue.id}`} className="sr-only" checked={paidBy === p} onChange={() => setPaidBy(p)} />
                      {p === "STORE" ? "The store" : "Feasto (the ride)"}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <TextField label="Message" hint="Needed to turn it down." value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={300} />
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" loading={busy === "REJECT"} disabled={busy !== null} onClick={() => decide("REJECT")}>
                Turn down
              </Button>
              <Button loading={busy === "REFUND"} disabled={busy !== null || !(Number(amount) > 0)} onClick={() => decide("REFUND")}>
                Give back
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Waiting for {issue.store} to answer. It comes to you if the resident asks Feasto.</p>
        )
      ) : (
        <p className={`mt-3 text-sm font-medium ${issue.status === "RESOLVED" ? "text-emerald-700" : "text-red-700"}`}>
          {issue.status === "RESOLVED"
            ? `${formatPeso(issue.amount)} ${issue.given === "credit" ? "in Suki points" : "refunded"}, paid by ${issue.paidBy === "FEASTO" ? "Feasto" : "the store"}.`
            : `Turned down: “${issue.answer}”`}
        </p>
      )}
    </li>
  );
}
