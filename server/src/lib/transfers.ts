import type { OnlinePayment, ReceiveChannel } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { failPayment } from "./paymentFlow.js";

/**
 * Paying by sending money to one of Feasto's own accounts (GCash, Maya or a bank, set by the admin),
 * instead of on Xendit's page. Nobody types where the money goes: the account comes from the admin's
 * list. And a screenshot alone never counts: the admin opens the account's own history, finds the
 * reference number and the amount, and only then confirms. The orders reach the stores after that.
 *
 *   checkout -> orders AWAITING_PAYMENT, the resident sees the account
 *   -> they send it, upload the receipt, type its reference number (each one pays one order only)
 *   -> the admin confirms (the same saga as a paid online order) or says it wasn't found (undone)
 * Not sent within SEND_WITHIN_MINUTES: undone by itself, so the stock isn't held for nothing.
 */

export const SEND_WITHIN_MINUTES = 30;

export const RECEIVE_LABEL: Record<ReceiveChannel, string> = { GCASH: "GCash", MAYA: "Maya", BANK: "Bank transfer" };

/** The e-wallet a transfer counts as, for the stores' list of what they take; a bank is any online payment */
export const walletOfChannel = (channel: ReceiveChannel): OnlinePayment | null => (channel === "BANK" ? null : channel);

/** "0917 123 4567" for wallets, "1234 5678 90" for bank numbers: easier to read and type */
export const spaced = (number: string) => (/^09\d{9}$/.test(number) ? `${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}` : number.replace(/(.{4})(?=.)/g, "$1 "));

/** "GCash 0917 123 4567 (Feasto Naval)" or "BDO 1234 5678 90 (Feasto Naval)" */
export const accountLine = (a: { channel: ReceiveChannel; bankName: string | null; accountName: string; accountNumber: string }) =>
  `${a.channel === "BANK" ? (a.bankName ?? "Bank") : RECEIVE_LABEL[a.channel]} ${spaced(a.accountNumber)} (${a.accountName})`;

/** What a receipt's reference number looks like for each kind of account */
export function refProblem(channel: ReceiveChannel, ref: string) {
  if (channel === "GCASH") return /^\d{13}$/.test(ref) ? null : "A GCash reference number has 13 digits. It's on the receipt, after “Ref No.”";
  return /^[A-Z0-9]{6,30}$/.test(ref) ? null : "Enter the reference number from the receipt: 6 to 30 letters and numbers.";
}

/** Transfers never sent: undo the checkout, like an online payment page left unpaid */
export async function expireUnsentTransfers(log: (...args: unknown[]) => void) {
  const stale = await prisma.checkout.findMany({
    where: { transferAccountId: { not: null }, transferSentAt: null, paymentStatus: "PENDING", createdAt: { lt: new Date(Date.now() - SEND_WITHIN_MINUTES * 60_000) } },
    select: { id: true },
    take: 20,
  });
  for (const { id } of stale) await failPayment(id, `The transfer wasn't sent within ${SEND_WITHIN_MINUTES} minutes`, log);
  return stale.length;
}
