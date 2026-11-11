import type { Metadata } from "next";
import { MobileHeading } from "@/components/app/mobile-shell";
import { NotificationFeed } from "@/components/app/notification-feed";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <div className="md:max-w-3xl">
      <MobileHeading title="Notifications" subtitle="Updates on your orders, payments and table bookings." />
      <NotificationFeed
        emptyText="When a store accepts your order, a rider heads your way or a booking changes, you'll see it here."
        emptyAction={{ href: "/resident", label: "Order something" }}
      />
    </div>
  );
}
