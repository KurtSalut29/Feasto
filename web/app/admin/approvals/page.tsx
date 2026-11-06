import { Bike, Building2, CalendarCheck, CalendarClock, Cake, FileBadge, HeartPulse, House, Mail, MapPin, Phone, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Avatar } from "@/components/app/avatar";
import { DocumentPreview } from "@/components/app/document-preview";
import { ReviewActions } from "@/components/app/review-actions";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { ApprovalStatus, StoreType } from "@/lib/types";

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
  return new Date(date) < new Date() ? <span className="font-semibold text-red-700">Expired {formatDate(date)}</span> : <>Valid until {formatDate(date)}</>;
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
    <li className="flex flex-col rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{title}</p>
          <p className="truncate text-sm text-muted">{subtitle}</p>
        </div>
        <Badge tone={STATUS[item.status].tone} dot>
          {STATUS[item.status].label}
        </Badge>
      </div>
      <dl className="flex-1 space-y-2.5 px-5 pt-4 pb-3">{details}</dl>
      <div className="px-5 pb-4">{document}</div>
      {item.status !== "PENDING" && item.reviewNote && (
        <p className="mx-5 mb-4 rounded-xl bg-canvas px-3 py-2 text-sm text-muted">
          <span className="font-medium text-ink">Your note:</span> {item.reviewNote}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/40 px-5 py-3">
        <p className="text-xs text-muted">
          {item.status === "PENDING" || !item.reviewedAt ? `Applied ${timeAgo(item.createdAt)}` : `Reviewed ${formatDate(item.reviewedAt)}`}
        </p>
        {actions}
      </div>
    </li>
  );
}

async function Approvals({ searchParams }: Pick<PageProps<"/admin/approvals">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const kind = params.kind === "riders" ? "riders" : "stores";
  const status = STATUSES.find((s) => s === params.status) ?? "PENDING";
  const data = await serverApi<ApprovalsResponse>(`/admin/approvals?kind=${kind}&status=${status}`);
  const href = (k: string, s: string) => `/admin/approvals?kind=${k}&status=${s}`;
  const waiting = data.counts.stores.PENDING + data.counts.riders.PENDING;

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          waiting > 0
            ? `${waiting} ${waiting === 1 ? "application is" : "applications are"} waiting. New stores and free riders can't start until you approve them. Stores review their own riders.`
            : "New stores and free riders can't start until you approve them. Stores review their own riders."
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
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
        <ul className="grid gap-4 lg:grid-cols-2">
          {data.kind === "stores"
            ? data.items.map((store) => (
                <Application
                  key={store.id}
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
              ))
            : data.items.map((rider) => (
                <Application
                  key={rider.id}
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
              ))}
        </ul>
      )}
    </>
  );
}
