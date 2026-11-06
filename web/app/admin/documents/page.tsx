import { Bike, CalendarClock, CircleAlert, FileClock, Phone, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { DocumentPreview } from "@/components/app/document-preview";
import { RenewalReview } from "@/components/app/renewal-review";
import { ReviewActions } from "@/components/app/review-actions";
import { ApprovalBadge } from "@/components/app/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Pagination } from "@/components/ui/pagination";
import { requireRole } from "@/lib/auth";
import { daysLeft, formatDate, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { ApprovalStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Documents" };

type View = "renewals" | "expired" | "expiring";
type Kind = "stores" | "riders";
type Contact = { name: string; phone: string | null };
type RenewalRow = {
  id: string;
  kind: Kind;
  ownerId: string;
  name: string;
  contact: Contact;
  status: ApprovalStatus;
  number: string | null;
  expiresAt: string;
  document: "image" | "pdf" | null;
  submittedAt: string;
  currentNumber: string | null;
  currentExpiresAt: string | null;
  currentDocument: "image" | "pdf" | null;
};
type MonitorRow = {
  id: string;
  name: string;
  status: ApprovalStatus;
  number: string | null;
  expiresAt: string;
  contact: Contact;
  renewalWaiting: boolean;
  storeName: string | null;
  suspendedByAdmin: boolean;
};
type Response = {
  view: View;
  kind: Kind;
  page: number;
  pageSize: number;
  total: number;
  counts: { renewals: number; expired: Record<Kind, number>; expiring: Record<Kind, number> };
  renewals?: RenewalRow[];
  items?: MonitorRow[];
};

export default function AdminDocumentsPage({ searchParams }: PageProps<"/admin/documents">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Documents searchParams={searchParams} />
    </Suspense>
  );
}

const documentWord = (kind: Kind) => (kind === "stores" ? "Business permit" : "Driver's license");

function dueWords(date: string) {
  const left = daysLeft(date);
  if (left < 0) return `${-left} ${left === -1 ? "day" : "days"} ago`;
  if (left === 0) return "today";
  return `in ${left} ${left === 1 ? "day" : "days"}`;
}

function PhoneLink({ contact }: { contact: Contact }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <Phone className="size-3.5 text-gray-400" aria-hidden />
      {contact.name}
      {contact.phone && (
        <>
          {" · "}
          <a href={`tel:${contact.phone}`} className="font-medium text-brand-700 hover:underline">
            {contact.phone}
          </a>
        </>
      )}
    </span>
  );
}

function Side({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">{title}</p>
      {children}
    </div>
  );
}

function RenewalCard({ renewal }: { renewal: RenewalRow }) {
  const word = documentWord(renewal.kind);
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{renewal.name}</p>
          <p className="text-sm text-muted">
            {word} · sent {timeAgo(renewal.submittedAt).replace("Just now", "just now")}
          </p>
        </div>
        <ApprovalBadge status={renewal.status} />
      </div>
      <div className="grid flex-1 gap-4 px-5 py-4 sm:grid-cols-2">
        <Side title="On file now">
          <p className="text-sm text-ink">{renewal.currentNumber ?? "No number"}</p>
          <p className="text-sm text-muted">{renewal.currentExpiresAt ? `Until ${formatDate(renewal.currentExpiresAt)}` : "No date"}</p>
          <DocumentPreview href={`/api/documents/${renewal.kind === "stores" ? "store" : "rider"}/${renewal.ownerId}`} kind={renewal.currentDocument} label={`${word} on file`} />
        </Side>
        <Side title="Renewed">
          <p className="text-sm font-medium text-ink">{renewal.number}</p>
          <p className="text-sm font-medium text-ink">Until {formatDate(renewal.expiresAt)}</p>
          <DocumentPreview href={`/api/documents/renewal/${renewal.id}/file`} kind={renewal.document} label={`Renewed ${word.toLowerCase()}`} />
        </Side>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/40 px-5 py-3 text-sm">
        <PhoneLink contact={renewal.contact} />
        <RenewalReview path={`/admin/renewals/${renewal.id}/review`} name={renewal.name} />
      </div>
    </li>
  );
}

function MonitorItem({ item, kind }: { item: MonitorRow; kind: Kind }) {
  const word = documentWord(kind);
  const expired = daysLeft(item.expiresAt) < 0;
  const subject = kind === "stores" ? "Store" : item.storeName ? `Rider for ${item.storeName}` : "Free rider";
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="min-w-[200px] flex-1">
        <p className="font-semibold text-ink">{item.name}</p>
        <p className="text-sm text-muted">
          {subject} · {item.number ?? "no number"}
        </p>
        <p className="mt-1 text-sm">
          <PhoneLink contact={item.contact} />
        </p>
      </div>
      <div className="w-44">
        <p className={`text-sm font-semibold ${expired ? "text-red-700" : "text-amber-800"}`}>
          {expired ? "Expired" : "Expires"} {dueWords(item.expiresAt)}
        </p>
        <p className="text-sm text-muted">{formatDate(item.expiresAt)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {item.status === "SUSPENDED" && <ApprovalBadge status="SUSPENDED" />}
        {item.renewalWaiting && (
          <Link href="/admin/documents?view=renewals">
            <Badge tone="info" dot>
              Renewal waiting
            </Badge>
          </Link>
        )}
        {kind === "riders" && item.storeName && item.renewalWaiting && <span className="text-xs text-muted">{item.storeName} reviews it</span>}
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <a href={`/api/documents/${kind === "stores" ? "store" : "rider"}/${item.id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-700 hover:underline">
          View document
        </a>
        {kind === "riders" && item.storeName && item.status === "SUSPENDED" && !item.suspendedByAdmin ? (
          <span className="text-sm text-muted">Suspended by {item.storeName}</span>
        ) : (
          <ReviewActions kind={kind} id={item.id} name={item.name} status={item.status} suspendNote={expired ? `${word} expired on ${formatDate(item.expiresAt)}.` : undefined} />
        )}
      </div>
    </li>
  );
}

async function Documents({ searchParams }: Pick<PageProps<"/admin/documents">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const view: View = params.view === "expired" || params.view === "expiring" ? params.view : "renewals";
  const kind: Kind = params.kind === "riders" ? "riders" : "stores";
  const page = Math.max(1, Number(params.page) || 1);
  const data = await serverApi<Response>(`/admin/documents?view=${view}&kind=${kind}&page=${page}`);
  const { counts } = data;
  const href = (v: View, k: Kind = kind, n?: number) => `/admin/documents?view=${v}&kind=${k}${n && n > 1 ? `&page=${n}` : ""}`;
  const items = data.items ?? [];
  const renewals = data.renewals ?? [];

  return (
    <>
      <PageHeader title="Documents" description="Renewed permits and licenses to check, and the ones that have expired or are about to." />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <LinkTabs
          variant="segmented"
          label="Document list"
          tabs={[
            { href: href("renewals"), label: "Renewals", Icon: FileClock, count: counts.renewals, active: view === "renewals" },
            { href: href("expired"), label: "Expired", Icon: CircleAlert, count: counts.expired.stores + counts.expired.riders, active: view === "expired" },
            { href: href("expiring"), label: "Expiring soon", Icon: CalendarClock, count: counts.expiring.stores + counts.expiring.riders, active: view === "expiring" },
          ]}
        />
        {view !== "renewals" && (
          <LinkTabs
            variant="segmented"
            label="Account type"
            tabs={[
              { href: href(view, "stores"), label: "Stores", Icon: Store, count: counts[view].stores, active: kind === "stores" },
              { href: href(view, "riders"), label: "Riders", Icon: Bike, count: counts[view].riders, active: kind === "riders" },
            ]}
          />
        )}
      </div>

      {view === "expired" && (
        <div className="mb-5">
          <Alert tone="info">
            {kind === "stores"
              ? "A store with an expired permit stays open until you suspend it, in case its renewal is on the way. Suspending hides it from residents."
              : "A rider with an expired license goes offline automatically and can't take jobs until a renewed license is approved."}
          </Alert>
        </div>
      )}

      {view === "renewals" ? (
        renewals.length === 0 ? (
          <Card>
            <EmptyState Icon={FileClock} title="No renewals to check" text="Renewed permits and free riders' licenses appear here. Stores check their own riders' licenses." />
          </Card>
        ) : (
          <ul className="grid max-w-4xl gap-4">
            {renewals.map((renewal) => (
              <RenewalCard key={renewal.id} renewal={renewal} />
            ))}
          </ul>
        )
      ) : items.length === 0 ? (
        <Card>
          <EmptyState Icon={CalendarClock} title={view === "expired" ? "Nothing has expired" : "Nothing expiring soon"} text={view === "expired" ? `No ${kind} have an expired document.` : `No ${kind} have a document expiring in the next 30 days.`} />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <MonitorItem key={item.id} item={item} kind={kind} />
            ))}
          </ul>
        </Card>
      )}
      <div className="mt-4">
        <Pagination page={page} pageSize={data.pageSize} total={data.total} noun={view === "renewals" ? "renewals" : kind} href={(n) => href(view, kind, n)} />
      </div>
    </>
  );
}
