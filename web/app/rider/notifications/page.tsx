import type { Metadata } from "next";
import { MobileHeading } from "@/components/app/mobile-shell";
import { NotificationFeed } from "@/components/app/notification-feed";
import { PushCard } from "@/components/app/push-card";

export const metadata: Metadata = { title: "Notifications" };

export default function RiderNotificationsPage() {
  return (
    <div className="md:max-w-3xl">
      <MobileHeading title="Notifications" subtitle="New jobs, delivery updates and news about your license." />
      <PushCard place="settings" className="mb-4" />
      <NotificationFeed
        emptyText="When a job reaches you, a store marks your pickup ready or your license is reviewed, you'll see it here."
        emptyAction={{ href: "/rider", label: "See jobs" }}
      />
    </div>
  );
}
