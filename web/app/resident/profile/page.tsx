import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { ProfileForm } from "@/components/app/profile-form";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit profile" };

export default function EditProfilePage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <EditProfile />
    </Suspense>
  );
}

async function EditProfile() {
  const user = await requireRole("RESIDENT");
  return (
    <>
      <Link href="/resident/account" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Account
      </Link>
      <MobileHeading title="Edit profile" />
      <ProfileForm name={user.name} phone={user.phone} email={user.email} />
    </>
  );
}
