import { CalendarDays, FileBadge, ReceiptText, Star } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app/dashboard-shell";
import { NotificationsView } from "@/components/app/notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default function VendorNotificationsPage() {
  return (
    <>
      <PageHeader eyebrow="Inbox" title="Notifications" description="New orders, riders on the way, bookings, reviews and your permit." />
      <NotificationsView
        emptyText="When a resident orders, a rider accepts a delivery, a table is booked or your permit is reviewed, you'll see it here."
        emptyAction={{ href: "/vendor/orders", label: "Open orders" }}
        topics={[
          { Icon: ReceiptText, title: "Orders", text: "New orders, and when a rider is on the way to pick up." },
          { Icon: CalendarDays, title: "Table bookings", text: "New and cancelled reservations." },
          { Icon: Star, title: "Reviews", text: "What residents say about your food." },
          { Icon: FileBadge, title: "Your permit", text: "When it's reviewed, and before it expires." },
        ]}
      />
    </>
  );
}
