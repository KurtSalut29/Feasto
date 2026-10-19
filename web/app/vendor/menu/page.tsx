import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { MenuItem } from "@/lib/types";
import { MenuManager } from "./menu-manager";

export const metadata: Metadata = { title: "Menu" };

export default function VendorMenuPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorMenu />
    </Suspense>
  );
}

async function VendorMenu() {
  await requireRole("VENDOR");
  const { items } = await serverApi<{ items: MenuItem[] }>("/vendor/menu");
  return (
    <>
      <PageHeader title="Menu" description="The dishes residents can order from your store." />
      <MenuManager items={items} />
    </>
  );
}
