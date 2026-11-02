import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { PasswordForm } from "@/components/app/password-form";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Change password" };

export default function VendorPasswordPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorPassword />
    </Suspense>
  );
}

async function VendorPassword() {
  const user = await requireRole("VENDOR");
  return (
    <>
      <PageHeader eyebrow="Account" title="Change password" description={`For ${user.email}`} />
      <div className="grid max-w-4xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card title="New password" Icon={KeyRound}>
          <div className="p-5">
            <PasswordForm />
          </div>
        </Card>
        <Card title="Good to know">
          <ul className="space-y-3 p-5 text-sm text-muted">
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              Use 8 or more characters with letters and numbers. Longer is stronger.
            </li>
            <li className="flex gap-2.5">
              <LogOut className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              Other phones and computers signed in to this account are logged out. You stay logged in here.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
