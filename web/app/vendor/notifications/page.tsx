import type { Metadata } from "next";
import { PageHeader } from "@/components/app/dashboard-shell";
import { NotificationFeed } from "@/components/app/notification-feed";
import { PushCard } from "@/components/app/push-card";

export const metadata: Metadata = { title: "Notifications" };

export default function VendorNotificationsPage() {
  return (
    <>
      <PageHeader eyebrow="Inbox" title="Notifications" description="New orders, riders on the way, bookings, reviews and your permit." />
      <div className="max-w-2xl">
        <PushCard place="settings" className="mb-4" />
        <NotificationFeed
          emptyText="When a resident orders, a rider accepts a delivery, a table is booked or your permit is reviewed, you'll see it here."
          emptyAction={{ href: "/vendor/orders", label: "Open orders" }}
        />
      </div>
    </>
  );
}
