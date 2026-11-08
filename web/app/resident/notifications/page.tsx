import type { Metadata } from "next";
import { MobileHeading } from "@/components/app/mobile-shell";
import { NotificationFeed } from "./notification-feed";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <MobileHeading title="Notifications" subtitle="Updates on your orders, payments and table bookings." />
      <NotificationFeed />
    </>
  );
}
