import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
  await requireRole("RESIDENT");
  return (
    <>
      <Link href="/resident/account" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Account
      </Link>
      <MobileHeading title="Change password" />
      <PasswordForm />
    </>
  );
}
