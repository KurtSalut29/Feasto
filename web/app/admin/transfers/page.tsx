import { BadgeCheck, Clock, ReceiptText, Send } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { DocumentPreview } from "@/components/app/document-preview";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatPeso, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { TransferReview } from "./transfer-review";

export const metadata: Metadata = { title: "Transfers" };

type Status = "WAITING" | "CHECKED";
type Transfer = {
  checkoutId: string;
  amount: number;
  createdAt: string;
  to: string;
  ref: string | null;
  from: string | null;
  sentAt: string | null;
  checkedAt: string | null;
  note: string | null;
  hasProof: boolean;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  resident: { name: string; phone: string | null };
  stores: string[];
};

const TABS: { status: Status; label: string; Icon: typeof Clock }[] = [
  { status: "WAITING", label: "To check", Icon: Clock },
  { status: "CHECKED", label: "Checked", Icon: BadgeCheck },
];

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function TransfersPage({ searchParams }: Params) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Transfers searchParams={searchParams} />
    </Suspense>
  );
}

async function Transfers({ searchParams }: Params) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const status: Status = params.status === "CHECKED" ? "CHECKED" : "WAITING";
  const data = await serverApi<{ transfers: Transfer[]; waiting: number; unsent: number }>(`/admin/transfers?status=${status}`);

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Transfers"
        description="Residents who sent their payment to one of Feasto's accounts. Find each one in that account's own history before you confirm: the store gets the order only after."
      />
      <div className="space-y-5">
        <LinkTabs
          variant="segmented"
          label="Transfers"
          tabs={TABS.map((t) => ({ href: `/admin/transfers?status=${t.status}`, label: t.label, Icon: t.Icon, count: t.status === "WAITING" ? data.waiting : undefined, active: t.status === status }))}
        />
        {status === "WAITING" && data.unsent > 0 && (
          <Alert tone="info">
            {data.unsent} {data.unsent === 1 ? "order is" : "orders are"} waiting for the resident to send the money. Each one is cancelled by itself if nothing is sent within 30 minutes.
          </Alert>
        )}
        {data.transfers.length === 0 ? (
          <EmptyState
            Icon={Send}
            title={status === "WAITING" ? "No transfers to check" : "Nothing checked yet"}
            text={status === "WAITING" ? "When a resident sends a payment to one of the accounts in Settings, it shows up here." : "Transfers you confirm or turn down move here."}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {data.transfers.map((t) => (
              <li key={t.checkoutId} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="flex-1 space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold tracking-tight text-ink tabular-nums">{formatPeso(t.amount)}</p>
                      <p className="text-sm text-muted">
                        {t.resident.name} · {t.stores.join(", ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{t.sentAt ? `Sent ${timeAgo(t.sentAt)}` : timeAgo(t.createdAt)}</span>
                  </div>
                  <dl className="divide-y divide-line rounded-xl border border-line text-sm">
                    {[
                      ["To", t.to],
                      ["From", t.from ?? "—"],
                      ["Reference no.", t.ref ?? "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 px-3.5 py-2">
                        <dt className="text-muted">{k}</dt>
                        <dd className={`text-right font-medium break-all text-ink ${k === "Reference no." ? "font-mono tracking-wide" : ""}`}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {t.hasProof ? (
                    <DocumentPreview href={`/api/admin/transfers/${t.checkoutId}/proof`} kind="image" label="Receipt" />
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <ReceiptText className="size-4" aria-hidden />
                      No receipt
                    </p>
                  )}
                </div>
                <footer className="border-t border-line bg-canvas/40 px-5 py-3">
                  {t.status === "PENDING" ? (
                    <TransferReview checkoutId={t.checkoutId} amount={t.amount} to={t.to} />
                  ) : (
                    <p className="text-sm text-muted">
                      <span className={`font-semibold ${t.status === "PAID" ? "text-emerald-700" : "text-red-700"}`}>{t.status === "PAID" ? "Confirmed" : "Not found"}</span>
                      {t.checkedAt && `, ${formatDateTime(t.checkedAt)}`}
                      {t.note && <span className="mt-1 block text-ink">“{t.note}”</span>}
                    </p>
                  )}
                </footer>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
