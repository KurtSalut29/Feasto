import { Bike, Building2, Cake, CalendarCheck, CalendarClock, FileBadge, HeartPulse, House, Mail, MapPin, Phone, ShieldCheck, Star, Store, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Avatar } from "@/components/app/avatar";
import { DocumentPreview } from "@/components/app/document-preview";
import { ReviewActions } from "@/components/app/review-actions";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { SearchBar } from "@/components/app/search-bar";
import { SplitQueue } from "@/components/app/split-queue";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatDate, isExpired, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { ApprovalStatus, StoreType } from "@/lib/types";
import { riderAverage } from "@/lib/rider-ratings";

export const metadata: Metadata = { title: "Approvals" };

const STATUSES: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
const STATUS: Record<ApprovalStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

type Contact = { name: string; email: string; phone: string | null };
type Review = { id: string; status: ApprovalStatus; reviewNote: string | null; reviewedAt: string | null; createdAt: string; document: "image" | "pdf" | null };
type StoreItem = Review & {
  name: string;
  storeType: StoreType;
  address: string;
  acceptsReservations: boolean;
  businessName: string | null;
  businessPhone: string | null;
  permitNumber: string | null;
  permitExpiresAt: string | null;
  owner: Contact;
};
type RiderItem = Review & {
  vehicleModel: string | null;
  plateNumber: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  birthDate: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  suspendedByAdmin: boolean;
  ratingSum: number;
  ratingCount: number;
  vendor: { name: string } | null;
  user: Contact;
};
type ApprovalsResponse = {
  counts: Record<"stores" | "riders", Record<ApprovalStatus, number>>;
} & ({ kind: "stores"; items: StoreItem[] } | { kind: "riders"; items: RiderItem[] });

export default function AdminApprovalsPage({ searchParams }: PageProps<"/admin/approvals">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Approvals searchParams={searchParams} />
    </Suspense>
  );
}

/** One labeled line in an application, e.g. "Phone  0917…". */
function Detail({ Icon, label, children }: { Icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[20px_88px_minmax(0,1fr)] items-start gap-2 text-sm">
      <Icon className="mt-0.5 size-4 text-gray-400" aria-hidden />
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

/** "Valid until …", or a warning when the date has passed. */
function Expiry({ date }: { date: string | null }) {
  if (!date) return <>Not given</>;
  return isExpired(date) ? <span className="font-semibold text-red-700">Expired {formatDate(date)}</span> : <>Valid until {formatDate(date)}</>;
}

/** A store's or rider's application: who, the details to check, and the decision buttons. */
function Application({
  avatar,
  title,
  subtitle,
  item,
  details,
  document,
  actions,
}: {
  avatar: ReactNode;
  title: string;
  subtitle: string;
  item: Review;
  details: ReactNode;
  document: ReactNode;
  actions: ReactNode;
}) {
  return (
    <article aria-label={title} className="flex flex-col">
      <div className="flex items-start gap-3 border-b border-line pb-4">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{title}</p>
          <p className="truncate text-sm text-muted">{subtitle}</p>
        </div>
        <Badge tone={STATUS[item.status].tone} dot>
          {STATUS[item.status].label}
        </Badge>
      </div>
      <div className="space-y-4 py-4">
        <dl className="space-y-2.5">{details}</dl>
        <div>{document}</div>
      </div>
      {item.status !== "PENDING" && item.reviewNote && (
        <p className="mb-4 rounded-xl bg-canvas px-3 py-2 text-sm text-muted">
          <span className="font-medium text-ink">Your note:</span> {item.reviewNote}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3">
        <p className="text-sm text-muted">
          {item.status === "PENDING" || !item.reviewedAt ? `Applied ${timeAgo(item.createdAt)}` : `Reviewed ${formatDate(item.reviewedAt)}`}
        </p>
        {actions}
      </div>
    </article>
  );
}

async function Approvals({ searchParams }: Pick<PageProps<"/admin/approvals">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const kind = params.kind === "riders" ? "riders" : "stores";
  const status = STATUSES.find((s) => s === params.status) ?? "PENDING";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const data = await serverApi<ApprovalsResponse>(`/admin/approvals?kind=${kind}&status=${status}`);
  const href = (k: string, s: string, extra: Record<string, string> = {}) => `/admin/approvals?${new URLSearchParams({ kind: k, status: s, ...extra })}`;
  const waiting = data.counts.stores.PENDING + data.counts.riders.PENDING;

  // Search by name, email, phone, plate or permit, so a long list stays easy to work through
  const needle = q.toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) => !needle || fields.some((f) => f?.toLowerCase().includes(needle));
  const stores = data.kind === "stores" ? data.items.filter((x) => matches(x.name, x.owner.name, x.owner.email, x.owner.phone, x.permitNumber, x.address)) : [];
  const riders = data.kind === "riders" ? data.items.filter((x) => matches(x.user.name, x.user.email, x.user.phone, x.plateNumber, x.licenseNumber, x.vendor?.name)) : [];
  const shownIds = data.kind === "stores" ? stores.map((x) => x.id) : riders.map((x) => x.id);
  const selectedId = shownIds.find((id) => id === params.id) ?? shownIds[0];
  const keep: Record<string, string> = q ? { q } : {};

  const rowLine = (title: string, subtitle: string, item: Review, warning: string | null) => (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold text-ink">{title}</span>
        <span className="shrink-0 text-xs text-muted">{item.status === "PENDING" || !item.reviewedAt ? timeAgo(item.createdAt) : formatDate(item.reviewedAt)}</span>
      </span>
      <span className="block truncate text-sm text-muted">{subtitle}</span>
      <span className="mt-1.5 flex flex-wrap gap-1.5">
        {item.status !== "PENDING" && (
          <Badge tone={STATUS[item.status].tone} dot>
            {STATUS[item.status].label}
          </Badge>
        )}
        {warning && <Badge tone="danger">{warning}</Badge>}
        {!item.document && <Badge tone="warning">No document</Badge>}
      </span>
    </>
  );

  const storeDetail = (store: StoreItem) => (
    <Application
      item={store}
      title={store.name}
      subtitle={STORE_TYPE_LABEL[store.storeType]}
      avatar={
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Store className="size-5" aria-hidden />
        </span>
      }
      details={
        <>
          <Detail Icon={MapPin} label="Address">
            {store.address}
          </Detail>
          <Detail Icon={CalendarCheck} label="Bookings">
            {store.acceptsReservations ? "Takes table reservations" : "No reservations"}
          </Detail>
          <Detail Icon={Building2} label="Business">
            {store.businessName ?? "Not given"}
            {store.businessPhone && ` · ${store.businessPhone}`}
          </Detail>
          <Detail Icon={FileBadge} label="Permit no.">
            {store.permitNumber ?? "Not given"}
          </Detail>
          <Detail Icon={CalendarClock} label="Permit">
            <Expiry date={store.permitExpiresAt} />
          </Detail>
          <Detail Icon={Phone} label="Owner">
            {store.owner.name} · {store.owner.phone ?? "no phone"}
          </Detail>
          <Detail Icon={Mail} label="Email">
            {store.owner.email}
          </Detail>
        </>
      }
      document={<DocumentPreview href={`/api/documents/store/${store.id}`} kind={store.document} label="Business permit" />}
      actions={<ReviewActions kind="stores" id={store.id} name={store.name} status={store.status} />}
    />
  );

  const riderDetail = (rider: RiderItem) => (
    <Application
      item={rider}
      title={rider.user.name}
      subtitle={rider.vendor ? `Rider for ${rider.vendor.name}` : "Free rider"}
      avatar={<Avatar name={rider.user.name} size="lg" />}
      details={
        <>
          <Detail Icon={Bike} label="Motorcycle">
            {rider.vehicleModel ?? "Not given"}
            {rider.plateNumber && ` · plate ${rider.plateNumber}`}
          </Detail>
          <Detail Icon={ShieldCheck} label="License">
            {rider.licenseNumber ?? "Not given"}
          </Detail>
          {(rider.status === "APPROVED" || rider.status === "SUSPENDED") && (
            <Detail Icon={Star} label="Rating">
              {rider.ratingCount
                ? `${riderAverage(rider)!.toFixed(1)} of 5 from ${rider.ratingCount} ${rider.ratingCount === 1 ? "resident" : "residents"}`
                : "No ratings yet"}
            </Detail>
          )}
          <Detail Icon={CalendarClock} label="Expiry">
            <Expiry date={rider.licenseExpiresAt} />
          </Detail>
          <Detail Icon={Cake} label="Birth date">
            {rider.birthDate ? formatDate(rider.birthDate) : "Not given"}
          </Detail>
          <Detail Icon={House} label="Address">
            {rider.address ?? "Not given"}
          </Detail>
          <Detail Icon={HeartPulse} label="Emergency">
            {rider.emergencyName ? `${rider.emergencyName} · ${rider.emergencyPhone}` : "Not given"}
          </Detail>
          <Detail Icon={Phone} label="Phone">
            {rider.user.phone ?? "No phone"}
          </Detail>
          <Detail Icon={Mail} label="Email">
            {rider.user.email}
          </Detail>
        </>
      }
      document={<DocumentPreview href={`/api/documents/rider/${rider.id}`} kind={rider.document} label="Driver's license" />}
      actions={
        // A store lifts the suspensions it made itself
        rider.vendor && rider.status === "SUSPENDED" && !rider.suspendedByAdmin ? (
          <p className="text-sm text-muted">Suspended by {rider.vendor.name}</p>
        ) : (
          <ReviewActions kind="riders" id={rider.id} name={rider.user.name} status={rider.status} />
        )
      }
    />
  );

  const selectedStore = stores.find((x) => x.id === selectedId);
  const selectedRider = riders.find((x) => x.id === selectedId);

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Approvals"
        description={
          waiting > 0
            ? `${waiting} ${waiting === 1 ? "application is" : "applications are"} waiting, oldest first. New stores and free riders can't start until you approve them.`
            : "New stores and free riders can't start until you approve them. Stores review their own riders."
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <LinkTabs
          variant="segmented"
          label="Account type"
          tabs={[
            { href: href("stores", "PENDING"), label: "Stores", Icon: Store, count: data.counts.stores.PENDING, active: kind === "stores" },
            { href: href("riders", "PENDING"), label: "Riders", Icon: Bike, count: data.counts.riders.PENDING, active: kind === "riders" },
          ]}
        />
        <LinkTabs
          variant="segmented"
          label="Status"
          tabs={STATUSES.map((s) => ({ href: href(kind, s), label: STATUS[s].label, count: data.counts[kind][s], active: s === status }))}
        />
      </div>

      <SearchBar action="/admin/approvals" hidden={{ kind, status }} value={q} placeholder={kind === "stores" ? "Store, owner, email or permit no." : "Name, email, plate or license"} />

      {data.items.length === 0 ? (
        <Card>
          <EmptyState
            Icon={ShieldCheck}
            title={status === "PENDING" ? "Nothing to review" : `No ${STATUS[status].label.toLowerCase()} ${kind}`}
            text={
              status === "PENDING"
                ? `You're all caught up. New ${kind} will appear here.`
                : `${kind === "stores" ? "Stores" : "Riders"} you mark as ${STATUS[status].label.toLowerCase()} are listed here.`
            }
          />
        </Card>
      ) : (
        <SplitQueue
          title={`${STATUS[status].label} ${kind} · ${shownIds.length}`}
          order={status === "PENDING" ? "Oldest first" : "Newest first"}
          numbered={status === "PENDING"}
          selectedId={selectedId}
          empty={`Nothing matches “${q}”.`}
          rows={
            data.kind === "stores"
              ? stores.map((store) => ({
                  id: store.id,
                  href: href(kind, status, { ...keep, id: store.id }),
                  content: rowLine(
                    store.name,
                    `${STORE_TYPE_LABEL[store.storeType]} · ${store.owner.name}`,
                    store,
                    store.permitExpiresAt && isExpired(store.permitExpiresAt) ? "Permit expired" : null,
                  ),
                }))
              : riders.map((rider) => ({
                  id: rider.id,
                  href: href(kind, status, { ...keep, id: rider.id }),
                  content: rowLine(
                    rider.user.name,
                    `${rider.vendor ? `Rider for ${rider.vendor.name}` : "Free rider"} · ${rider.plateNumber ?? "no plate"}`,
                    rider,
                    rider.licenseExpiresAt && isExpired(rider.licenseExpiresAt) ? "License expired" : null,
                  ),
                }))
          }
          detail={selectedStore ? storeDetail(selectedStore) : selectedRider ? riderDetail(selectedRider) : null}
        />
      )}
    </>
  );
}
