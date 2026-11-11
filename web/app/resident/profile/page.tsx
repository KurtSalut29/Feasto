import type { Metadata } from "next";
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
    // Forms stay a readable width on big screens
    <div className="md:max-w-2xl">
      <MobileHeading title="Edit profile" />
      <ProfileForm name={user.name} phone={user.phone} email={user.email} />
    </div>
  );
}
