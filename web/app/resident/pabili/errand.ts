import type { BadgeTone } from "@/components/ui/badge";

export type ErrandStatus = "REQUESTED" | "ACCEPTED" | "BOUGHT" | "DELIVERED" | "CANCELLED";

/** A Pabili as the resident sees it (GET /errands/:id) */
export type Errand = {
  id: string;
  status: ErrandStatus;
  shopName: string;
  shopAddress: string;
  shopLat: number;
  shopLng: number;
  items: { name: string; quantity: number; note: string | null }[];
  notes: string | null;
  budget: string;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryFee: string;
  /** The fee first quoted, when the rider found the shop away from the pin and the fee was corrected */
  quotedFee: string | null;
  shopMovedKm: number | null;
  placeId: string | null;
  receiptTotal: string | null;
  receiptPhotoUrl: string | null;
  deliveryPhotoUrl: string | null;
  cancelReason: string | null;
  exclusiveUntil: string | null;
  createdAt: string;
  acceptedAt: string | null;
  boughtAt: string | null;
  finishedAt: string | null;
};

export const ERRAND_STATUS: Record<ErrandStatus, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: "Finding a rider", tone: "warning" },
  ACCEPTED: { label: "Buying", tone: "info" },
  BOUGHT: { label: "On the way", tone: "brand" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export type PlaceKind = "MARKET" | "PHARMACY" | "GROCERY" | "HARDWARE" | "SARI_SARI" | "OTHER";

export const PLACE_KIND: Record<PlaceKind, string> = {
  MARKET: "Market",
  PHARMACY: "Drugstore",
  GROCERY: "Grocery",
  HARDWARE: "Hardware",
  SARI_SARI: "Sari-sari store",
  OTHER: "Other shop",
};

/** A shop on the admin's list of Pabili places */
export type PabiliPlace = { id: string; name: string; kind: PlaceKind; address: string; latitude: number; longitude: number; distanceKm: number | null };
