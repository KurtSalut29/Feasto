import { timingSafeEqual } from "node:crypto";
import type { OnlinePayment, PayoutChannel } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { marshal, recordUnmarshal } from "./marshalling.js";

/**
 * Feasto's client for Xendit, the payment gateway that takes the resident's card or e-wallet
 * payment. Feasto never sees card numbers: the resident types them on Xendit's own payment page
 * (an "invoice"), and Xendit tells Feasto the result. This file is the client side of those calls
 * (a remote procedure call over HTTPS): each request is marshalled to JSON and logged on the
 * admin's System page like every other trip between processes.
 *
 * In Test Mode (a `xnd_development_` key) everything is real except the money: Xendit's test
 * cards and e-wallet test pages are used instead of real ones.
 */

const BASE = "https://api.xendit.co";

export class XenditError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const auth = Buffer.from(`${config.xendit.secretKey}:`).toString("base64");
  const where = { transport: "http" as const, channel: `xendit ${method} ${path.replace(/[0-9a-f]{24}|disb-[\w-]+/g, ":id").replace(/\?.*/, "")}`, kind: "xendit" };
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : marshal(body, where),
    // Never leave a resident waiting on a slow network
    signal: AbortSignal.timeout(12_000),
  });
  const text = await response.text();
  recordUnmarshal(text, where);
  const data = text ? (JSON.parse(text) as T & { error_code?: string; message?: string }) : ({} as T & { error_code?: string; message?: string });
  if (!response.ok) throw new XenditError(response.status, data.error_code ?? "XENDIT_ERROR", data.message ?? `Xendit answered ${response.status}`);
  return data;
}

/** Xendit's names for the ways to pay Feasto offers. Coins.ph pays through QR Ph. */
const CHANNEL: Record<OnlinePayment, string[]> = {
  GCASH: ["GCASH"],
  MAYA: ["PAYMAYA"],
  GRABPAY: ["GRABPAY"],
  SHOPEEPAY: ["SHOPEEPAY"],
  COINS: ["QRPH"],
  VISA: ["CREDIT_CARD"],
  MASTERCARD: ["CREDIT_CARD"],
  JCB: ["CREDIT_CARD"],
  AMEX: ["CREDIT_CARD"],
};

/** Back from Xendit's channel to Feasto's wallet, when it's one Feasto knows */
const WALLET: Record<string, OnlinePayment> = { GCASH: "GCASH", PAYMAYA: "MAYA", GRABPAY: "GRABPAY", SHOPEEPAY: "SHOPEEPAY" };
export const walletOf = (channel: string | null | undefined): OnlinePayment | null => WALLET[channel ?? ""] ?? null;

export type Invoice = {
  id: string;
  external_id: string;
  status: "PENDING" | "PAID" | "SETTLED" | "EXPIRED";
  amount: number;
  invoice_url: string;
  expiry_date: string;
  payment_method?: string;
  payment_channel?: string;
};

/** How long the resident has to pay before the invoice expires and the order is cancelled */
export const PAY_WITHIN_MINUTES = 15;

/**
 * A payment page for one checkout. The resident already chose how to pay in Feasto, so the page
 * opens on that method only. If Xendit can't offer it, it falls back to every method.
 */
export async function createInvoice(input: {
  checkoutId: string;
  amount: number;
  description: string;
  method: OnlinePayment | null;
  returnUrl: string;
  email?: string;
  items: { name: string; quantity: number; price: number }[];
}) {
  const body = {
    external_id: input.checkoutId,
    amount: input.amount,
    currency: "PHP",
    description: input.description,
    invoice_duration: PAY_WITHIN_MINUTES * 60,
    success_redirect_url: `${input.returnUrl}&result=paid`,
    failure_redirect_url: `${input.returnUrl}&result=failed`,
    should_send_email: false,
    ...(input.email && { payer_email: input.email }),
    items: input.items,
  };
  const channels = input.method ? CHANNEL[input.method] : null;
  try {
    return await call<Invoice>("POST", "/v2/invoices", channels ? { ...body, payment_methods: channels } : body);
  } catch (error) {
    if (channels && error instanceof XenditError && error.status === 400) return call<Invoice>("POST", "/v2/invoices", body);
    throw error;
  }
}

export const getInvoice = (id: string) => call<Invoice>("GET", `/v2/invoices/${id}`);

/** Closes a payment page nobody needs any more (the resident cancelled before paying). */
export const expireInvoice = (id: string) => call<Invoice>("POST", `/invoices/${id}/expire!`);

/** Gives back part or all of a paid invoice, e.g. one store's order that was declined. */
export const refundInvoice = (input: { invoiceId: string; amount: number; referenceId: string; reason: "CANCELLATION" | "REQUESTED_BY_CUSTOMER" }) =>
  call<{ id: string; status: string }>("POST", "/refunds", {
    invoice_id: input.invoiceId,
    amount: input.amount,
    currency: "PHP",
    reason: input.reason,
    reference_id: input.referenceId,
  });

// ---------- Payouts: Feasto sending money out to stores and riders ----------

/** Xendit's channel codes for the e-wallets and banks a store or rider can be paid to */
const PAYOUT_CHANNEL: Record<PayoutChannel, string> = {
  GCASH: "PH_GCASH",
  MAYA: "PH_PAYMAYA",
  BDO: "PH_BDO",
  BPI: "PH_BPI",
  METROBANK: "PH_MET",
  LANDBANK: "PH_LBP",
  UNIONBANK: "PH_UBP",
  SECURITY_BANK: "PH_SEC",
};

export type XenditPayout = {
  id: string;
  reference_id: string;
  amount: number;
  status: "ACCEPTED" | "REQUESTED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REVERSED";
  failure_code?: string;
};

/**
 * Sends money from Feasto's Xendit balance to a store's or rider's e-wallet or bank. The
 * idempotency key makes a repeated call (a timeout, a redelivered message) return the same payout
 * instead of sending the money twice.
 */
export const createPayout = (input: { referenceId: string; idempotencyKey: string; amount: number; channel: PayoutChannel; accountName: string; accountNumber: string; description: string }) =>
  call<XenditPayout>(
    "POST",
    "/v2/payouts",
    {
      reference_id: input.referenceId,
      channel_code: PAYOUT_CHANNEL[input.channel],
      channel_properties: { account_holder_name: input.accountName, account_number: input.accountNumber },
      amount: input.amount,
      currency: "PHP",
      description: input.description,
    },
    { "Idempotency-key": input.idempotencyKey },
  );

export const getPayout = (id: string) => call<XenditPayout>("GET", `/v2/payouts/${encodeURIComponent(id)}`);

/** Feasto's money at Xendit (test money in Test Mode), which payouts are sent from */
export const getBalance = () => call<{ balance: number }>("GET", "/balance?account_type=CASH&currency=PHP");

/** True when a webhook carries the token from the Xendit dashboard (compared in constant time). */
export function isFromXendit(token: string | undefined) {
  const expected = config.xendit.callbackToken;
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
