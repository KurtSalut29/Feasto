import { CalendarDays, CreditCard, ShoppingBag, Truck } from "lucide-react";
import type { Metadata } from "next";
import { MobileHeading } from "@/components/app/mobile-shell";
import { NotificationsView } from "@/components/app/notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <MobileHeading title="Notifications" subtitle="Updates on your orders, payments and table bookings." />
      <NotificationsView
        emptyText="When a store accepts your order, a rider heads your way or a booking changes, you'll see it here."
        emptyAction={{ href: "/resident", label: "Order something" }}
        topics={[
          { Icon: Truck, title: "Your orders", text: "Accepted, picked up, on the way and delivered." },
          { Icon: ShoppingBag, title: "Pabili", text: "When a rider takes it, buys your list and arrives." },
          { Icon: CreditCard, title: "Payments and refunds", text: "Confirmed payments, and money sent back." },
          { Icon: CalendarDays, title: "Table bookings", text: "Confirmed, changed or cancelled by the store." },
        ]}
      />
    </>
  );
}
