"use client";

import { RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PayoutRow, payoutsNote } from "@/components/app/payouts-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import type { PayoutsData } from "@/lib/types";

const SHOWN = 8;

/**
 * The money Feasto sent out: each store's and rider's share of online orders, from Feasto's Xendit
 * balance to their GCash, Maya or bank. The admin sees what's sent, on the way, waiting for an
 * account or failed, and can send failed ones again.
 */
export function PayoutsPanel({ data }: { data: PayoutsData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { totals, payouts, balance, mode } = data;

  async function retryAll() {
    setBusy(true);
    const result = await apiRequest<{ resent: number }>("/admin/payouts/retry", { method: "POST", body: {} });
    setBusy(false);
    if (!result.ok) return toast.error("Couldn't send them again", result.error);
    toast.success(`Sending ${result.data.resent} ${result.data.resent === 1 ? "payout" : "payouts"} again`);
    router.refresh();
  }

  const figures = [
    { label: "Sent", value: totals.sent, count: totals.sentCount, tone: "text-emerald-700" },
    { label: "On the way", value: totals.onTheWay, count: totals.onTheWayCount, tone: "text-ink" },
    { label: "Waiting for an account", value: totals.held, count: totals.heldCount, tone: totals.held ? "text-amber-800" : "text-ink" },
    { label: "Didn't go through", value: totals.failed, count: totals.failedCount, tone: totals.failed ? "text-red-700" : "text-ink" },
  ];

  return (
    <Card
      title="Payouts to stores and riders"
      Icon={Send}
      accent="emerald"
      description="Their share of each online order, sent from Feasto's Xendit balance when it's delivered or collected"
      footer={<p className="text-xs text-muted">{payoutsNote(mode)}</p>}
    >
      <div id="payouts" className="scroll-mt-24">
        {mode === "xendit" && (
          <div className="border-b border-line px-5 py-3">
            <p className="text-xs text-muted">Feasto&apos;s balance at Xendit (test money)</p>
            {balance === null || balance === undefined ? (
              <p className="mt-0.5 text-sm text-amber-800">Can&apos;t be read. In Xendit, give the API key the Balance: Read permission.</p>
            ) : (
              <p className="text-lg font-semibold text-ink tabular-nums">{formatPeso(balance)}</p>
            )}
          </div>
        )}
        <dl className="grid grid-cols-2 border-b border-line">
          {figures.map((f, i) => (
            <div key={f.label} className={`px-5 py-3 ${i % 2 ? "border-l border-line" : ""} ${i > 1 ? "border-t border-line" : ""}`}>
              <dt className="text-xs text-muted">{f.label}</dt>
              <dd className={`font-semibold tabular-nums ${f.tone}`}>{formatPeso(f.value)}</dd>
              <dd className="text-xs text-muted">
                {f.count} {f.count === 1 ? "payout" : "payouts"}
              </dd>
            </div>
          ))}
        </dl>
        {totals.failedCount > 0 && (
          <div className="border-b border-line px-5 py-3">
            <Button variant="secondary" loading={busy} className="h-9! w-full text-sm!" onClick={retryAll}>
              <RotateCcw className="size-4" aria-hidden />
              Send the {totals.failedCount} failed {totals.failedCount === 1 ? "payout" : "payouts"} again
            </Button>
          </div>
        )}
        {payouts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Payouts show here once an online order is delivered or collected.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {payouts.slice(0, SHOWN).map((p) => (
                <PayoutRow key={p.id} payout={p} showWho retryPath="/admin/payouts/retry" retryBody={{ id: p.id }} />
              ))}
            </ul>
            {payouts.length > SHOWN && (
              <details className="group border-t border-line">
                <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500">
                  <span className="group-open:hidden">Show {payouts.length - SHOWN} more</span>
                  <span className="hidden group-open:inline">Show fewer</span>
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {payouts.slice(SHOWN).map((p) => (
                    <PayoutRow key={p.id} payout={p} showWho retryPath="/admin/payouts/retry" retryBody={{ id: p.id }} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
