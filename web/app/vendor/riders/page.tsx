import { Bike, CalendarClock, IdCard, Mail, Phone, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Avatar } from "@/components/app/avatar";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { DocumentPreview } from "@/components/app/document-preview";
import { ReviewActions } from "@/components/app/review-actions";
import { ApprovalBadge } from "@/components/app/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { ApprovalStatus } from "@/lib/types";
import { RemoveRiderButton, RiderCode } from "./rider-controls";

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
  user: { name: string; email: string; phone: string | null };
};

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

  return (
    <>
      <PageHeader title="Riders" description="Your store's own riders. Check each one's license before approving them." />

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
            <section>
              <h2 className="mb-3 font-semibold text-ink">Waiting for your approval ({waiting.length})</h2>
              <ul className="grid gap-4 lg:grid-cols-2">
                {waiting.map((rider) => (
                  <RiderCard key={rider.id} rider={rider} />
                ))}
              </ul>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold text-ink">Your riders ({others.length})</h2>
              <ul className="grid gap-4 lg:grid-cols-2">
                {others.map((rider) => (
                  <RiderCard key={rider.id} rider={rider} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function RiderCard({ rider }: { rider: StoreRider }) {
  const expired = rider.licenseExpiresAt !== null && new Date(rider.licenseExpiresAt) < new Date();
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <Avatar name={rider.user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{rider.user.name}</p>
          <p className="truncate text-sm text-muted">{rider.status === "APPROVED" ? (rider.isOnline ? "Online now" : "Offline") : `Applied ${timeAgo(rider.createdAt)}`}</p>
        </div>
        <ApprovalBadge status={rider.status} />
      </div>
      <div className="flex-1 space-y-2.5 px-5 py-4 text-sm">
        <p className="flex gap-2 text-ink">
          <Bike className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
          {rider.vehicleModel ?? "Motorcycle"}
          {rider.plateNumber && ` · ${rider.plateNumber}`}
        </p>
        <p className="flex gap-2 text-ink">
          <IdCard className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
          {rider.licenseNumber ?? "No license number"}
        </p>
        {rider.licenseExpiresAt && (
          <p className={`flex gap-2 ${expired ? "font-semibold text-red-700" : "text-ink"}`}>
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
            {expired ? "Expired" : "Valid until"} {formatDate(rider.licenseExpiresAt)}
          </p>
        )}
        <p className="flex gap-2 text-ink">
          <Phone className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
          {rider.user.phone ?? "No phone"}
        </p>
        <p className="flex gap-2 break-all text-ink">
          <Mail className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
          {rider.user.email}
        </p>
        <DocumentPreview href={`/api/documents/rider/${rider.id}`} kind={rider.document} label="Driver's license" />
        {rider.reviewNote && rider.status !== "PENDING" && (
          <p className="rounded-xl bg-canvas px-3 py-2 text-muted">
            <span className="font-medium text-ink">Reason:</span> {rider.reviewNote}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/40 px-5 py-3">
        {rider.suspendedByAdmin ? (
          <p className="flex items-center gap-1.5 text-sm text-red-700">
            <ShieldAlert className="size-4" aria-hidden />
            Suspended by the Feasto admin
          </p>
        ) : (
          <>
            {rider.status !== "PENDING" && <RemoveRiderButton id={rider.id} name={rider.user.name} />}
            <ReviewActions kind="riders" basePath="/vendor/riders" id={rider.id} name={rider.user.name} status={rider.status} />
          </>
        )}
      </div>
    </li>
  );
}
