import { Alert } from "@/components/ui/alert";
import type { ApprovalStatus } from "@/lib/types";

const messages: Record<Exclude<ApprovalStatus, "APPROVED">, { tone: "pending" | "error"; title: string }> = {
  PENDING: { tone: "pending", title: "Waiting for approval" },
  REJECTED: { tone: "error", title: "Not approved" },
  SUSPENDED: { tone: "error", title: "Suspended" },
};

/**
 * Explains a store's or rider's review status. Renders nothing once approved.
 * `pendingText` and `blockedText` describe what the user can and can't do meanwhile.
 */
export function ApprovalNotice({
  status,
  reviewNote,
  pendingText,
  blockedText,
  reviewer = "the admin",
}: {
  status: ApprovalStatus;
  reviewNote: string | null;
  pendingText: string;
  blockedText: string;
  /** Who gave the reason, e.g. a rider's store */
  reviewer?: string;
}) {
  if (status === "APPROVED") return null;
  const { tone, title } = messages[status];

  return (
    <Alert tone={tone} title={title}>
      {status === "PENDING" ? pendingText : blockedText}
      {reviewNote && status !== "PENDING" && (
        <span className="mt-1 block">
          <span className="font-medium">Reason from {reviewer}:</span> {reviewNote}
        </span>
      )}
    </Alert>
  );
}
