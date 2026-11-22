-- Phase 3: the Daloy fee and the rider's delay bonus, Feasto Plus, a Pabili paid online first, PhilSys QR
-- (Level 2) and the rider's selfie (Level 3), and one rider taking two orders.

ALTER TABLE "PlatformSettings"
  ADD COLUMN "daloyFeeOn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "daloyPerMinute" DECIMAL(6,2) NOT NULL DEFAULT 2,
  ADD COLUMN "daloyFeeMax" DECIMAL(8,2) NOT NULL DEFAULT 30,
  ADD COLUMN "delayBonusOn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "delayBonusPerMinute" DECIMAL(6,2) NOT NULL DEFAULT 1,
  ADD COLUMN "delayBonusMax" DECIMAL(8,2) NOT NULL DEFAULT 20,
  ADD COLUMN "plusOn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "plusPrice" DECIMAL(8,2) NOT NULL DEFAULT 99,
  ADD COLUMN "plusFreeDeliveries" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "plusDeliveryMax" DECIMAL(8,2) NOT NULL DEFAULT 50,
  ADD COLUMN "plusMinSpend" DECIMAL(8,2) NOT NULL DEFAULT 150,
  ADD COLUMN "pabiliPrepaidMax" INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "batchingOn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "batchPickupMeters" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "batchDropKm" DECIMAL(4,1) NOT NULL DEFAULT 1.5;

ALTER TABLE "Order"
  ADD COLUMN "daloyFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "riderBonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "riderBonusNote" TEXT;

ALTER TYPE "PromoAudience" ADD VALUE 'PLUS';

ALTER TABLE "User"
  ADD COLUMN "pcnHash" TEXT,
  ADD COLUMN "philsysQrAt" TIMESTAMP(3),
  ADD COLUMN "philsysMatch" JSONB,
  ADD COLUMN "philsysVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_pcnHash_key" ON "User"("pcnHash");

ALTER TABLE "RiderProfile"
  ADD COLUMN "selfieFile" TEXT,
  ADD COLUMN "selfieChallenge" TEXT,
  ADD COLUMN "selfieAt" TIMESTAMP(3),
  ADD COLUMN "livenessStatus" "IdCheck",
  ADD COLUMN "livenessNote" TEXT,
  ADD COLUMN "livenessCheckedAt" TIMESTAMP(3);

ALTER TABLE "Errand"
  ADD COLUMN "prepaid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paymentStatus" "PaymentStatus",
  ADD COLUMN "paymentRef" TEXT,
  ADD COLUMN "paymentUrl" TEXT,
  ADD COLUMN "paidAmount" DECIMAL(10,2),
  ADD COLUMN "paidChannel" TEXT,
  ADD COLUMN "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Errand_paymentRef_key" ON "Errand"("paymentRef");

CREATE TYPE "PlusStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');
CREATE TABLE "PlusMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PlusStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(8,2) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "paymentUrl" TEXT,
    "paidChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlusMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlusMembership_paymentRef_key" ON "PlusMembership"("paymentRef");
CREATE INDEX "PlusMembership_userId_status_endsAt_idx" ON "PlusMembership"("userId", "status", "endsAt");
ALTER TABLE "PlusMembership" ADD CONSTRAINT "PlusMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
