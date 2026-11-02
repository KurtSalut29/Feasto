import type { Metadata } from "next";
import { Suspense } from "react";
import { FullMapFrame } from "@/components/map/full-map";
import { requireRole } from "@/lib/auth";
import { pinOf } from "@/lib/geo";
import { serverApi } from "@/lib/server-api";
import type { Address } from "@/lib/types";
import { StoresMap } from "./stores-map";

export const metadata: Metadata = { title: "Map" };

export default function ResidentMapPage() {
  return (
    <Suspense
      fallback={
        <FullMapFrame>
          <div aria-busy="true" className="h-full animate-pulse bg-gray-200/70" />
        </FullMapFrame>
      }
    >
      <ResidentMap />
    </Suspense>
  );
}

async function ResidentMap() {
  await requireRole("RESIDENT");
  // The stores themselves load in the browser, for whatever part of the map is on screen
  const { addresses } = await serverApi<{ addresses: Address[] }>("/me/addresses");
  const address = addresses.find((a) => a.isDefault);
  return <StoresMap home={address ? pinOf(address.latitude, address.longitude) : null} homeLabel={address?.label ?? null} />;
}
