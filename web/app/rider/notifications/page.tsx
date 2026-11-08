import type { Metadata } from "next";
import { MobileHeading } from "@/components/app/mobile-shell";
import { NotificationFeed } from "@/components/app/notification-feed";

export const metadata: Metadata = { title: "Notifications" };

export default function RiderNotificationsPage() {
  return (
    <>
      <MobileHeading title="Notifications" subtitle="New jobs, delivery updates and news about your license." />
      <NotificationFeed
        emptyText="When a job reaches you, a store marks your pickup ready or your license is reviewed, you'll see it here."
        emptyAction={{ href: "/rider", label: "See jobs" }}
      />
    </>
  );
}
