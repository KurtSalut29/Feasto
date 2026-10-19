import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { ApprovalStatus } from "@/lib/types";

const APPROVAL_BADGE: Record<ApprovalStatus, { tone: BadgeTone; label: string }> = {
  PENDING: { tone: "warning", label: "Pending approval" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "danger", label: "Rejected" },
  SUSPENDED: { tone: "danger", label: "Suspended" },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const { tone, label } = APPROVAL_BADGE[status];
  return <Badge tone={tone}>{label}</Badge>;
}
