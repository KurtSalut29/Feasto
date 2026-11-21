import type { Metadata } from "next";
import { PageHeader } from "@/components/app/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { PabiliAdmin } from "./pabili-admin";

export const metadata: Metadata = { title: "Pabili" };

export default async function AdminPabiliPage() {
  await requireRole("ADMIN");
  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Pabili"
        description="The shops residents choose from, the shops they asked for, and what Pabili can't buy or buys only with a prescription or for an adult."
      />
      <PabiliAdmin />
    </>
  );
}
