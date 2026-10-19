import type { ReactNode } from "react";
import { DashboardShell } from "@/components/app/dashboard-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <DashboardShell role="ADMIN">{children}</DashboardShell>;
}
