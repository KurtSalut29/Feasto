import type { Metadata } from "next";
import { PageHeader } from "@/components/app/dashboard-shell";
import { NotificationFeed } from "@/components/app/notification-feed";

export const metadata: Metadata = { title: "Notifications" };

export default function AdminNotificationsPage() {
  return (
    <>
      <PageHeader eyebrow="Inbox" title="Notifications" description="New applications, renewed documents, stuck orders and reports." />
      <div className="max-w-2xl">
        <NotificationFeed
          emptyText="When a store or rider applies, a document is renewed or an order gets stuck, you will see it here."
          emptyAction={{ href: "/admin/approvals", label: "Open approvals" }}
        />
      </div>
    </>
  );
}
