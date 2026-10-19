import type { ReactNode } from "react";
import { DashboardShell } from "@/components/app/dashboard-shell";
import { NewOrderAlert } from "@/components/app/new-order-alert";

export default function VendorLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell role="VENDOR">
      <NewOrderAlert />
      {children}
    </DashboardShell>
  );
}
