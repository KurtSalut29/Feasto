import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { ApprovalBadge } from "@/components/app/status-badges";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { VEHICLE_LABEL } from "@/lib/labels";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { ApprovalStatus, StoreType, VehicleType } from "@/lib/types";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Approvals" };

const STATUSES: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
const STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
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

function ContactCell({ title, contact }: { title: string; contact: Contact }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-ink">{title}</p>
      <p className="text-sm text-muted">
        {contact.name} · {contact.phone ?? "no phone"}
      </p>
      <p className="truncate text-sm text-muted">{contact.email}</p>
    </div>
  );
}

function ReviewInfo({ item }: { item: Review }) {
  if (item.status === "PENDING") return <p className="text-xs text-muted">Submitted {formatDate(item.createdAt)}</p>;
  return (
    <div className="space-y-1">
      <ApprovalBadge status={item.status} />
      {item.reviewNote && <p className="text-xs text-muted">“{item.reviewNote}”</p>}
      {item.reviewedAt && <p className="text-xs text-gray-400">Reviewed {formatDate(item.reviewedAt)}</p>}
    </div>
  );
}

async function Approvals({ searchParams }: Pick<PageProps<"/admin/approvals">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const kind = params.kind === "riders" ? "riders" : "stores";
  const status = STATUSES.find((s) => s === params.status) ?? "PENDING";
  const data = await serverApi<ApprovalsResponse>(`/admin/approvals?kind=${kind}&status=${status}`);
  const href = (k: string, s: string) => `/admin/approvals?kind=${k}&status=${s}`;

  return (
    <>
      <PageHeader title="Approvals" description="New stores and riders can't start until you approve them." />

      <LinkTabs
        tabs={[
          { href: href("stores", "PENDING"), label: "Stores", count: data.counts.stores.PENDING, active: kind === "stores" },
          { href: href("riders", "PENDING"), label: "Riders", count: data.counts.riders.PENDING, active: kind === "riders" },
        ]}
      />
      <div className="mt-5 mb-4">
        <LinkTabs
          variant="pills"
          tabs={STATUSES.map((s) => ({
            href: href(kind, s),
            label: STATUS_LABEL[s],
            count: data.counts[kind][s],
            active: s === status,
          }))}
        />
      </div>

      <Card>
        {data.items.length === 0 ? (
          <EmptyState
            Icon={ShieldCheck}
            title={status === "PENDING" ? "Nothing to review" : `No ${STATUS_LABEL[status].toLowerCase()} ${kind}`}
            text={
              status === "PENDING" ? `You're all caught up. New ${kind} will appear here.` : `${kind === "stores" ? "Stores" : "Riders"} you mark as ${STATUS_LABEL[status].toLowerCase()} are listed here.`
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {data.kind === "stores"
              ? data.items.map((store) => (
                  <li key={store.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center">
                    <ContactCell title={store.name} contact={store.owner} />
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-ink">
                        {STORE_TYPE_LABEL[store.storeType]}
                        {store.acceptsReservations && <span className="text-muted"> · takes reservations</span>}
                      </p>
                      <p className="text-muted">{store.address}</p>
                      <div className="mt-1">
                        <ReviewInfo item={store} />
                      </div>
                    </div>
                    <ReviewActions kind="stores" id={store.id} name={store.name} status={store.status} />
                  </li>
                ))
              : data.items.map((rider) => (
                  <li key={rider.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center">
                    <ContactCell title={rider.user.name} contact={rider.user} />
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-ink">
                        {VEHICLE_LABEL[rider.vehicleType]}
                        {rider.plateNumber && <span className="text-muted"> · {rider.plateNumber}</span>}
                      </p>
                      <p className="text-muted">
                        {rider.licenseNumber ? `License ${rider.licenseNumber}` : "No license needed"}
                      </p>
                      <div className="mt-1">
                        <ReviewInfo item={rider} />
                      </div>
                    </div>
                    <ReviewActions kind="riders" id={rider.id} name={rider.user.name} status={rider.status} />
                  </li>
                ))}
          </ul>
        )}
      </Card>
    </>
  );
}
