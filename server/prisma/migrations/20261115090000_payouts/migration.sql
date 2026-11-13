-- Payouts: after an online order is delivered or collected, Feasto sends the store's and the
-- rider's share to the e-wallet or bank they chose, through Xendit Payouts (test mode).

-- CreateEnum
CREATE TYPE "PayoutChannel" AS ENUM ('GCASH', 'MAYA', 'BDO', 'BPI', 'METROBANK', 'LANDBANK', 'UNIONBANK', 'SECURITY_BANK');

-- CreateEnum
CREATE TYPE "PayoutParty" AS ENUM ('STORE', 'RIDER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'NEEDS_ACCOUNT', 'SENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "payoutChannel" "PayoutChannel",
ADD COLUMN     "payoutName" TEXT,
ADD COLUMN     "payoutNumber" TEXT;

-- AlterTable
ALTER TABLE "RiderProfile" ADD COLUMN     "payoutChannel" "PayoutChannel",
ADD COLUMN     "payoutName" TEXT,
ADD COLUMN     "payoutNumber" TEXT;

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "party" "PayoutParty" NOT NULL,
    "vendorId" TEXT,
    "riderId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "PayoutChannel",
    "accountName" TEXT,
    "accountNumber" TEXT,
    "xenditId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failure" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id"),
    -- The store's share names the store, the rider's names the rider, never both
    CONSTRAINT "Payout_one_party" CHECK (("party" = 'STORE' AND "vendorId" IS NOT NULL AND "riderId" IS NULL) OR ("party" = 'RIDER' AND "riderId" IS NOT NULL AND "vendorId" IS NULL)),
    CONSTRAINT "Payout_amount_positive" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Payout_xenditId_key" ON "Payout"("xenditId");

-- CreateIndex
CREATE INDEX "Payout_vendorId_createdAt_idx" ON "Payout"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_riderId_createdAt_idx" ON "Payout"("riderId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_orderId_party_key" ON "Payout"("orderId", "party");

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
