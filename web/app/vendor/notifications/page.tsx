import type { Metadata } from "next";
import { PageHeader } from "@/components/app/dashboard-shell";
import { NotificationFeed } from "@/components/app/notification-feed";

export const metadata: Metadata = { title: "Notifications" };

export default function VendorNotificationsPage() {
  return (
    <>
      <PageHeader eyebrow="Inbox" title="Notifications" description="New orders, riders on the way, bookings, reviews and your permit." />
      <div className="max-w-2xl">
        <NotificationFeed
          emptyText="When a resident orders, a rider accepts a delivery, a table is booked or your permit is reviewed, you'll see it here."
          emptyAction={{ href: "/vendor/orders", label: "Open orders" }}
        />
      </div>
    </>
  );
}
