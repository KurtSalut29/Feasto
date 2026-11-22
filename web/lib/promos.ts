/** A line taken off an order, as the server worked it out (server/src/lib/promos.ts) */
export type DiscountLine = { kind: "DEAL" | "VOUCHER" | "DELIVERY" | "FIRST_ORDER" | "SENIOR" | "POINTS" | "PLUS"; label: string; amount: number; store: number; feasto: number; promoId?: string };

const c = (n: number) => Math.round(n * 100) / 100;

/** What the resident pays for one order: the food and the delivery fee, after its discounts (tips aside) */
export const orderTotal = (o: { subtotal: string | number; deliveryFee: string | number; storeDiscount?: string | number | null; feastoDiscount?: string | number | null }) =>
  c(Number(o.subtotal) + Number(o.deliveryFee) - Number(o.storeDiscount ?? 0) - Number(o.feastoDiscount ?? 0));

/** Everything taken off an order */
export const discountOf = (o: { storeDiscount?: string | number | null; feastoDiscount?: string | number | null }) => c(Number(o.storeDiscount ?? 0) + Number(o.feastoDiscount ?? 0));

export type VoucherCard = {
  id: string;
  code: string | null;
  title: string;
  benefit: "PERCENT_OFF" | "AMOUNT_OFF" | "FREE_DELIVERY" | "DELIVERY_OFF";
  value: number;
  maxDiscount: number | null;
  minSpend: number;
  store: { id: string; name: string } | null;
  campaign: string | null;
  startsAt: string;
  endsAt: string | null;
  firstOrder: boolean;
  usesLeft: number;
  problem: string | null;
  upcoming: boolean;
};

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

/** "₱50 off", "15% off, up to ₱100", "Free delivery" */
export function benefitWords(v: Pick<VoucherCard, "benefit" | "value" | "maxDiscount">) {
  if (v.benefit === "PERCENT_OFF") return `${v.value}% off${v.maxDiscount ? `, up to ${peso(v.maxDiscount)}` : ""}`;
  if (v.benefit === "AMOUNT_OFF") return `${peso(v.value)} off`;
  if (v.benefit === "FREE_DELIVERY") return v.maxDiscount ? `Free delivery, up to ${peso(v.maxDiscount)}` : "Free delivery";
  return `${peso(v.value)} off delivery`;
}

export const isDeliveryVoucher = (v: Pick<VoucherCard, "benefit">) => v.benefit === "FREE_DELIVERY" || v.benefit === "DELIVERY_OFF";
