import { Bike, CalendarCheck, Mail, MapPin, Phone, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Avatar } from "@/components/app/avatar";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/format";
import { VEHICLE_LABEL } from "@/lib/labels";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { ApprovalStatus, StoreType, VehicleType } from "@/lib/types";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Approvals" };

const STATUSES: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
const STATUS: Record<ApprovalStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

type Contact = { name: string; email: string; phone: string | null };
type Review = { id: string; status: ApprovalStatus; reviewNote: string | null; reviewedAt: string | null; createdAt: string };
type StoreItem = Review & { name: string; storeType: StoreType; address: string; acceptsReservations: boolean; owner: Contact };
type RiderItem = Review & { vehicleType: VehicleType; plateNumber: string | null; licenseNumber: string | null; user: Contact };
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

/** A store's or rider's application: who, the details to check, and the decision buttons. */
function Application({
  avatar,
  title,
  subtitle,
  item,
  details,
  actions,
}: {
  avatar: ReactNode;
  title: string;
  subtitle: string;
  item: Review;
  details: ReactNode;
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
      <dl className="flex-1 space-y-2.5 px-5 py-4">{details}</dl>
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
            ? `${waiting} ${waiting === 1 ? "application is" : "applications are"} waiting. New stores and riders can't start until you approve them.`
            : "New stores and riders can't start until you approve them."
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
                      <Detail Icon={Phone} label="Owner">
                        {store.owner.name} · {store.owner.phone ?? "no phone"}
                      </Detail>
                      <Detail Icon={Mail} label="Email">
                        {store.owner.email}
                      </Detail>
                    </>
                  }
                  actions={<ReviewActions kind="stores" id={store.id} name={store.name} status={store.status} />}
                />
              ))
            : data.items.map((rider) => (
                <Application
                  key={rider.id}
                  item={rider}
                  title={rider.user.name}
                  subtitle={`Rider · ${VEHICLE_LABEL[rider.vehicleType]}`}
                  avatar={<Avatar name={rider.user.name} size="lg" />}
                  details={
                    <>
                      <Detail Icon={Bike} label="Vehicle">
                        {VEHICLE_LABEL[rider.vehicleType]}
                        {rider.plateNumber && ` · plate ${rider.plateNumber}`}
                      </Detail>
                      <Detail Icon={ShieldCheck} label="License">
                        {rider.licenseNumber ?? "Not needed for this vehicle"}
                      </Detail>
                      <Detail Icon={Phone} label="Phone">
                        {rider.user.phone ?? "No phone"}
                      </Detail>
                      <Detail Icon={Mail} label="Email">
                        {rider.user.email}
                      </Detail>
                    </>
                  }
                  actions={<ReviewActions kind="riders" id={rider.id} name={rider.user.name} status={rider.status} />}
                />
              ))}
        </ul>
      )}
    </>
  );
}
