import { Bike, IdCard, ShoppingBag, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { MobileHeading } from "@/components/app/mobile-shell";
import { NotificationsView } from "@/components/app/notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default function RiderNotificationsPage() {
  return (
    <>
      <MobileHeading title="Notifications" subtitle="New jobs, delivery updates and news about your license." />
      <NotificationsView
        emptyText="When a job reaches you, a store marks your pickup ready or your license is reviewed, you'll see it here."
        emptyAction={{ href: "/rider", label: "See jobs" }}
        topics={[
          { Icon: Bike, title: "Jobs near you", text: "New deliveries, and when a store has your pickup ready." },
          { Icon: ShoppingBag, title: "Pabili requests", text: "A resident asking you to buy something for them." },
          { Icon: Wallet, title: "Money sent to you", text: "Your share of each online delivery, once it's sent." },
          { Icon: IdCard, title: "Your license", text: "When it's reviewed, and before it expires." },
        ]}
      />
    </>
  );
}
