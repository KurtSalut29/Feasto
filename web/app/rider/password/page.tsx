import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { PasswordForm } from "@/components/app/password-form";
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
  await requireRole("RIDER");
  return (
    <>
      <MobileHeading title="Change password" />
      <PasswordForm />
    </>
  );
}
