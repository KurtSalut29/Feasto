import type { BadgeTone } from "@/components/ui/badge";
import type { PabiliItem, ShopCategory } from "@/lib/pabili";

export type ErrandStatus = "REQUESTED" | "ACCEPTED" | "BOUGHT" | "DELIVERED" | "CANCELLED";

/** A Pabili as the resident sees it (GET /errands/:id) */
export type Errand = {
  id: string;
  status: ErrandStatus;
  shopName: string;
  shopAddress: string;
  /** Unknown until the rider buys: then where their phone was */
  shopLat: number | null;
  shopLng: number | null;
  items: PabiliItem[];
  notes: string | null;
  budget: string;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryFee: string;
  /** The most the fee can be; until the rider buys, deliveryFee is the lowest */
  feeMax: string | null;
  receiptTotal: string | null;
  receiptPhotoUrl: string | null;
  deliveryPhotoUrl: string | null;
  cancelReason: string | null;
  exclusiveUntil: string | null;
  createdAt: string;
  acceptedAt: string | null;
  boughtAt: string | null;
  finishedAt: string | null;
  shopCategory: ShopCategory | null;
  /** Alcohol or cigarettes on the list: the rider checks the ID at the door */
  adultCheck: boolean;
  /** For the rider: "CHEMICAL", "LPG", "BULKY" */
  handling: string[];
  estimateTotal: string | null;
  itemsPhotoUrl: string | null;
  priceFlag: string | null;
  idCheckedAt: string | null;
  confirmedAt: string | null;
  hasPrescription: boolean;
};

export const ERRAND_STATUS: Record<ErrandStatus, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: "Finding a rider", tone: "warning" },
  ACCEPTED: { label: "Buying", tone: "info" },
  BOUGHT: { label: "On the way", tone: "brand" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/** A shop's name and address as a Google Maps search, for finding a shop that has no pin */
export const mapsSearch = (name: string, address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}, Naval, Biliran`)}`;
