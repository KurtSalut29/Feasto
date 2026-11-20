import { ClipboardCheck, Flag, Hourglass, Send } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app/dashboard-shell";
import { NotificationsView } from "@/components/app/notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default function AdminNotificationsPage() {
  return (
    <>
      <PageHeader eyebrow="Inbox" title="Notifications" description="New applications, renewed documents, stuck orders and reports." />
      <NotificationsView
        emptyText="When a store or rider applies, a document is renewed or an order gets stuck, you will see it here."
        emptyAction={{ href: "/admin/approvals", label: "Open approvals" }}
        topics={[
          { Icon: ClipboardCheck, title: "To approve", text: "New stores and riders, renewed permits, licenses and IDs." },
          { Icon: Hourglass, title: "Stuck orders", text: "Orders waiting too long for a store or rider." },
          { Icon: Send, title: "Transfers", text: "Residents who sent money to one of Feasto's accounts." },
          { Icon: Flag, title: "User reports", text: "Problems residents, stores and riders report." },
        ]}
      />
    </>
  );
}
