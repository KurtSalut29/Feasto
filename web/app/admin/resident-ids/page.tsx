import { BadgeCheck, Clock, IdCard, Mail, Phone, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { DocCheck, type DocCheckResult } from "@/components/app/doc-check";
import { DocumentPreview } from "@/components/app/document-preview";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Pagination } from "@/components/ui/pagination";
import { requireRole } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/format";
import { idTypeLabel } from "@/lib/identity";
import { serverApi } from "@/lib/server-api";
import { IdReview } from "./id-review";

export const metadata: Metadata = { title: "Resident IDs" };

type Status = "PENDING" | "VERIFIED" | "REJECTED";
type Resident = {
  id: string;
  name: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  email: string;
  phone: string | null;
  createdAt: string;
  idType: string | null;
  idStatus: Status;
  idReviewNote: string | null;
  idReviewedAt: string | null;
  disabledAt: string | null;
  document: "image" | "pdf" | null;
  check?: DocCheckResult;
  /** PhilSys QR (Level 2): what matched the account; eVerify only once Feasto is approved */
  philsysQrAt?: string | null;
  philsysMatch?: { nameMatches: boolean; birthDateMatches: boolean | null; signed: boolean; everify: boolean | null } | null;
  philsysVerifiedAt?: string | null;
};
type Response = { status: Status; page: number; pageSize: number; total: number; counts: Record<Status, number>; notUploaded: number; residents: Resident[] };

const TABS: { status: Status; label: string; Icon: typeof Clock }[] = [
  { status: "PENDING", label: "To check", Icon: Clock },
  { status: "VERIFIED", label: "Verified", Icon: BadgeCheck },
  { status: "REJECTED", label: "Not accepted", Icon: XCircle },
];

export default function ResidentIdsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ResidentIds searchParams={searchParams} />
    </Suspense>
  );
}

async function ResidentIds({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const status = (TABS.find((t) => t.status === params.status)?.status ?? "PENDING") as Status;
  const page = Number(params.page) || 1;
  const data = await serverApi<Response>(`/admin/resident-ids?status=${status}&page=${page}`);
  const href = (s: Status, p = 1) => `/admin/resident-ids?status=${s}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Resident IDs"
        description="Each resident sends a photo of a valid ID when they sign up. Check that it's a real ID and that its name matches the account."
      />
      <div className="space-y-5">
        <LinkTabs
          variant="segmented"
          label="IDs"
          tabs={TABS.map((t) => ({ href: href(t.status), label: t.label, Icon: t.Icon, count: data.counts[t.status], active: t.status === status }))}
        />
        {status === "PENDING" && data.notUploaded > 0 && (
          <Alert tone="info">
            {data.notUploaded} {data.notUploaded === 1 ? "resident hasn't" : "residents haven't"} sent an ID yet (accounts from before IDs were asked). Their Home asks them for one.
          </Alert>
        )}
        {data.residents.length === 0 ? (
          <EmptyState
            Icon={IdCard}
            title={status === "PENDING" ? "No IDs to check" : status === "VERIFIED" ? "No verified IDs yet" : "No IDs turned down"}
            text={status === "PENDING" ? "New residents' IDs show up here, oldest first." : "IDs you check move here."}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {data.residents.map((r) => (
              <li key={r.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="flex-1 space-y-3 p-5">
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Name on the account</p>
                    <p className="mt-0.5 text-lg font-semibold text-ink">{r.name}</p>
                    {r.lastName && (
                      <p className="text-sm text-muted">
                        Last: <span className="text-ink">{r.lastName}</span> · First: <span className="text-ink">{r.firstName}</span>
                        {r.middleName && (
                          <>
                            {" "}
                            · Middle: <span className="text-ink">{r.middleName}</span>
                          </>
                        )}
                        {r.suffix && ` · ${r.suffix}`}
                      </p>
                    )}
                  </div>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="size-4" aria-hidden />
                      {r.email}
                    </span>
                    {r.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-4" aria-hidden />
                        {r.phone}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    <span className="font-semibold text-ink">{idTypeLabel(r.idType)}</span> · signed up {timeAgo(r.createdAt)}
                  </p>
                  <DocumentPreview href={`/api/documents/resident/${r.id}`} kind={r.document} label={idTypeLabel(r.idType)} />
                  {r.document && <DocCheck check={r.check} />}
                  {r.philsysMatch && (
                    <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${r.philsysMatch.nameMatches && r.philsysMatch.birthDateMatches !== false ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
                      <span className="font-semibold">PhilSys QR scanned{r.philsysQrAt ? ` ${timeAgo(r.philsysQrAt)}` : ""}:</span> name {r.philsysMatch.nameMatches ? "matches" : "is different"}
                      {r.philsysMatch.birthDateMatches === null ? "" : `, birthday ${r.philsysMatch.birthDateMatches ? "matches" : "is different"}`}.{" "}
                      {r.philsysVerifiedAt ? "Confirmed by PhilSys eVerify." : "Not confirmed with PhilSys yet (eVerify isn't connected), so compare with the photo."}
                    </p>
                  )}
                </div>
                <footer className="border-t border-line bg-canvas/40 px-5 py-3">
                  {r.idStatus === "PENDING" ? (
                    <IdReview id={r.id} name={r.name} />
                  ) : (
                    <p className="text-sm text-muted">
                      <span className={`font-semibold ${r.idStatus === "VERIFIED" ? "text-emerald-700" : "text-red-700"}`}>{r.idStatus === "VERIFIED" ? "Verified" : "Not accepted"}</span>
                      {r.idReviewedAt && `, ${formatDateTime(r.idReviewedAt)}`}
                      {r.idReviewNote && <span className="mt-1 block text-ink">“{r.idReviewNote}”</span>}
                    </p>
                  )}
                </footer>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="residents" href={(p) => href(status, p)} />
      </div>
    </>
  );
}
