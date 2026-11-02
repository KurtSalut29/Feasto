import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FullMapFrame } from "@/components/map/full-map";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { RiderDelivery } from "@/lib/types";
import { JobsMap } from "./jobs-map";

export const metadata: Metadata = { title: "Map" };

export default function RiderMapPage() {
  return (
    <Suspense
      fallback={
        <FullMapFrame>
          <div aria-busy="true" className="h-full animate-pulse bg-gray-200/70" />
        </FullMapFrame>
      }
    >
      <RiderMap />
    </Suspense>
  );
}

async function RiderMap() {
  const user = await requireRole("RIDER");
  // Riders waiting for approval see their status on Home instead
  if (user.riderProfile?.status !== "APPROVED") redirect("/rider");
  // The jobs themselves load in the browser, for whatever part of the map is on screen
  const { order: active } = await serverApi<{ order: RiderDelivery | null }>("/rider/active");
  return <JobsMap active={active} online={Boolean(user.riderProfile.isOnline)} />;
}
