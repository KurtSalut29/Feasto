import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { PasswordPage } from "@/components/app/password-page";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ChangePassword />
    </Suspense>
  );
}

async function ChangePassword() {
  const user = await requireRole("RIDER");
  return <PasswordPage email={user.email} backHref="/rider/account" />;
}
