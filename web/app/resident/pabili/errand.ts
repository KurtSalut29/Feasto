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
