import { Bike, CalendarClock, Clock, IdCard, Mail, Phone, Radio, ShieldAlert, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/app/avatar";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { DocumentPreview } from "@/components/app/document-preview";
import { RenewalReview } from "@/components/app/renewal-review";
import { ReviewActions } from "@/components/app/review-actions";
import { ApprovalBadge } from "@/components/app/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { daysLeft, formatDate, timeAgo } from "@/lib/format";
import { orderCode } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { ApprovalStatus, OrderStatus } from "@/lib/types";
import { riderAverage } from "@/lib/rider-ratings";
import { RemoveRiderButton, RiderCode } from "./rider-controls";
import { Roster, type RosterRider } from "./roster";

export const metadata: Metadata = { title: "Riders" };

type StoreRider = {
  id: string;
  vehicleModel: string | null;
  plateNumber: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  document: "image" | "pdf" | null;
  status: ApprovalStatus;
  reviewNote: string | null;
  suspendedByAdmin: boolean;
  isOnline: boolean;
  createdAt: string;
  deliveries: number;
  deliveriesToday: number;
  ratingSum: number;
  ratingCount: number;
  currentOrder: { id: string; status: OrderStatus; forThisStore: boolean } | null;
  user: { name: string; email: string; phone: string | null };
  renewal: { id: string; number: string | null; expiresAt: string; submittedAt: string; document: "image" | "pdf" | null } | null;
};

/** A license this close to expiring gets flagged, so the rider renews in time */
const EXPIRES_SOON_DAYS = 30;

export default function VendorRidersPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Riders />
    </Suspense>
  );
}

async function Riders() {
  await requireRole("VENDOR");
  const { code, storeStatus, riders } = await serverApi<{ code: string; storeStatus: ApprovalStatus; riders: StoreRider[] }>("/vendor/riders");
  const waiting = riders.filter((r) => r.status === "PENDING");
  const others = riders.filter((r) => r.status !== "PENDING");
  const approved = others.filter((r) => r.status === "APPROVED" && !r.suspendedByAdmin);

  const figures = [
    { Icon: Users, label: "Approved riders", value: approved.length, tone: "bg-brand-50 text-brand-600 ring-brand-100" },
    { Icon: Radio, label: "Online now", value: approved.filter((r) => r.isOnline).length, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
    { Icon: Bike, label: "On a delivery", value: approved.filter((r) => r.currentOrder).length, tone: "bg-sky-50 text-sky-600 ring-sky-100" },
    { Icon: UserCheck, label: "Waiting for you", value: waiting.length, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
  ];

  return (
    <>
      <PageHeader eyebrow="Your store" title="Riders" description="Your store's own riders. They get your delivery jobs first." />

      <section aria-label="Your riders at a glance" className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {figures.map(({ Icon, label, value, tone }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}>
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs text-muted">{label}</span>
              <span className="block text-lg leading-tight font-semibold text-ink tabular-nums">{value}</span>
            </span>
          </div>
        ))}
      </section>

      {storeStatus === "APPROVED" ? (
        <RiderCode code={code} />
      ) : (
        <div className="mb-6">
          <Alert tone="pending" title="Your store isn't approved yet">
            Riders can join with your store&apos;s code once an admin approves your store.
          </Alert>
        </div>
      )}

      {riders.length === 0 ? (
        <Card>
          <EmptyState Icon={Bike} title="No riders yet" text="Share your store's code. Riders enter it when they sign up, then they appear here for you to review." />
        </Card>
      ) : (
        <div className="space-y-6">
          {waiting.length > 0 && (
            <section aria-labelledby="waiting-title">
              <h2 id="waiting-title" className="mb-1 flex items-center gap-2 font-semibold text-ink">
                Waiting for your approval
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{waiting.length}</span>
              </h2>
              <p className="mb-3 text-sm text-muted">Check that the license photo matches the details before you approve.</p>
              <ul className="grid gap-4 lg:grid-cols-2">
                {waiting.map((rider) => (
                  <ApplicantCard key={rider.id} rider={rider} />
                ))}
              </ul>
            </section>
          )}
          {others.length > 0 && <Roster riders={others.map(toRosterRider)} />}
        </div>
      )}
    </>
  );
}

function licenseState(rider: StoreRider): RosterRider["license"] {
  if (!rider.licenseExpiresAt) return { number: rider.licenseNumber, text: "No expiry date", tone: "none" };
  const left = daysLeft(rider.licenseExpiresAt);
  if (left < 0) return { number: rider.licenseNumber, text: `Expired ${formatDate(rider.licenseExpiresAt)}`, tone: "expired" };
  if (left <= EXPIRES_SOON_DAYS) return { number: rider.licenseNumber, text: `Expires in ${left} ${left === 1 ? "day" : "days"}`, tone: "soon" };
  return { number: rider.licenseNumber, text: `Valid until ${formatDate(rider.licenseExpiresAt)}`, tone: "ok" };
}

function toRosterRider(rider: StoreRider): RosterRider {
  const license = licenseState(rider);
  const inactive = rider.status !== "APPROVED" || rider.suspendedByAdmin;
  const job = rider.currentOrder;
  const [state, stateText]: [RosterRider["state"], string] = inactive
    ? ["inactive", rider.suspendedByAdmin ? "Suspended by admin" : rider.status === "SUSPENDED" ? "Suspended" : "Not approved"]
    : job
      ? ["delivering", job.forThisStore ? `${job.status === "PICKED_UP" ? "Delivering" : "Picking up"} ${orderCode(job.id)}` : "On another store's job"]
      : rider.isOnline
        ? ["online", "Online, free"]
        : ["offline", "Offline"];

  return {
    id: rider.id,
    name: rider.user.name,
    phone: rider.user.phone,
    vehicle: rider.vehicleModel ?? "Motorcycle",
    plate: rider.plateNumber,
    license,
    state,
    stateText,
    deliveries: rider.deliveries,
    deliveriesToday: rider.deliveriesToday,
    rating: riderAverage(rider),
    ratingCount: rider.ratingCount,
    needsAttention: !inactive && (Boolean(rider.renewal) || license.tone === "expired" || license.tone === "soon"),
    details: <RiderDetails rider={rider} />,
  };
}

/** What opens under a rider in the roster: contact, license, and what the store can do. */
function RiderDetails({ rider }: { rider: StoreRider }) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-2.5 text-sm">
        <p className="flex gap-2 text-ink">
          <Phone className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
          {rider.user.phone ? (
            <a href={`tel:${rider.user.phone}`} className="text-brand-700 hover:underline">
              {rider.user.phone}
            </a>
          ) : (
            "No phone"
          )}
        </p>
        <p className="flex gap-2 break-all text-ink">
          <Mail className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
          {rider.user.email}
        </p>
        <p className="flex gap-2 text-ink">
          <Clock className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
          Joined {timeAgo(rider.createdAt)}
        </p>
        {rider.currentOrder?.forThisStore && (
          <Link href={`/vendor/orders?order=${rider.currentOrder.id}`} className="inline-flex text-sm font-semibold text-brand-700 hover:underline">
            Open order {orderCode(rider.currentOrder.id)}
          </Link>
        )}
        {rider.reviewNote && (
          <p className="rounded-xl bg-white px-3 py-2 text-muted ring-1 ring-line">
            <span className="font-medium text-ink">Reason:</span> {rider.reviewNote}
          </p>
        )}
      </div>
      <div className="space-y-3">
        <DocumentPreview href={`/api/documents/rider/${rider.id}`} kind={rider.document} label="Driver's license" />
        {rider.renewal && (
          <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm">
            <p className="font-semibold text-ink">Renewed license to check</p>
            <p className="text-ink">
              {rider.renewal.number} · valid until {formatDate(rider.renewal.expiresAt)}
            </p>
            <DocumentPreview href={`/api/documents/renewal/${rider.renewal.id}/file`} kind={rider.renewal.document} label="Renewed driver's license" />
            <RenewalReview path={`/vendor/rider-renewals/${rider.renewal.id}/review`} name={rider.user.name} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3 md:col-span-2">
        {rider.suspendedByAdmin ? (
          <p className="flex items-center gap-1.5 text-sm text-red-700">
            <ShieldAlert className="size-4" aria-hidden />
            Suspended by the Feasto admin
          </p>
        ) : (
          <>
            <RemoveRiderButton id={rider.id} name={rider.user.name} />
            <ReviewActions kind="riders" basePath="/vendor/riders" id={rider.id} name={rider.user.name} status={rider.status} />
          </>
        )}
      </div>
    </div>
  );
}

/** A rider who asked to join, with everything needed to decide. */
function ApplicantCard({ rider }: { rider: StoreRider }) {
  const license = licenseState(rider);
  return (
    <li className="flex flex-col rounded-2xl border border-amber-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-2 ring-amber-50">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <Avatar name={rider.user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{rider.user.name}</p>
          <p className="truncate text-sm text-muted">Applied {timeAgo(rider.createdAt)}</p>
        </div>
        <ApprovalBadge status={rider.status} />
      </div>
      <div className="grid flex-1 gap-4 px-5 py-4 text-sm sm:grid-cols-2">
        <div className="space-y-2.5">
          <p className="flex gap-2 text-ink">
            <Bike className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
            {rider.vehicleModel ?? "Motorcycle"}
            {rider.plateNumber && ` · ${rider.plateNumber}`}
          </p>
          <p className="flex gap-2 text-ink">
            <IdCard className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
            {rider.licenseNumber ?? "No license number"}
          </p>
          <p className={`flex gap-2 ${license.tone === "expired" ? "font-semibold text-red-700" : "text-ink"}`}>
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
            {license.text}
          </p>
          <p className="flex gap-2 text-ink">
            <Phone className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
            {rider.user.phone ?? "No phone"}
          </p>
          <p className="flex gap-2 break-all text-ink">
            <Mail className="mt-0.5 size-4 shrink-0 text-gray-500" aria-hidden />
            {rider.user.email}
          </p>
        </div>
        <DocumentPreview href={`/api/documents/rider/${rider.id}`} kind={rider.document} label="Driver's license" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/40 px-5 py-3">
        <ReviewActions kind="riders" basePath="/vendor/riders" id={rider.id} name={rider.user.name} status={rider.status} />
      </div>
    </li>
  );
}
