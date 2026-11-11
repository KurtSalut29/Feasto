import type { OnlinePayment } from "../generated/prisma/client.js";

/** Every e-wallet and card Feasto offers, in the order the checkout shows them */
export const ONLINE_PAYMENTS = ["GCASH", "MAYA", "GRABPAY", "SHOPEEPAY", "COINS", "VISA", "MASTERCARD", "JCB", "AMEX"] as const satisfies readonly OnlinePayment[];

type Takes = { name: string; acceptsCash: boolean; onlinePayments: OnlinePayment[] };

/** The first store in the cart that doesn't take this way to pay, if any. "ONLINE" is any wallet or card. */
export function storeRefusing(stores: Takes[], method: "COD" | "ONLINE" | OnlinePayment) {
  return stores.find((s) =>
    method === "COD" ? !s.acceptsCash : method === "ONLINE" ? s.onlinePayments.length === 0 : !s.onlinePayments.includes(method),
  );
}

/** How residents and riders see each one */
export const ONLINE_LABEL: Record<OnlinePayment, string> = {
  GCASH: "GCash",
  MAYA: "Maya",
  GRABPAY: "GrabPay",
  SHOPEEPAY: "ShopeePay",
  COINS: "Coins.ph",
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  JCB: "JCB",
  AMEX: "American Express",
};
