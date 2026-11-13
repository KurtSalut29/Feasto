-- Feasto's earnings: a commission on each order's food, a share of the delivery fee, and a
-- ledger of what was settled with each store and rider.

-- AlterEnum
ALTER TYPE "ActivityCategory" ADD VALUE 'EARNINGS';

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "commissionPercent" DECIMAL(4,1) NOT NULL DEFAULT 10,
ADD COLUMN     "pickupCommissionPercent" DECIMAL(4,1) NOT NULL DEFAULT 5,
ADD COLUMN     "riderFeePercent" DECIMAL(4,1) NOT NULL DEFAULT 10,
ADD COLUMN     "freeTrialDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "commissionFreeUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "commissionRate" DECIMAL(4,1) NOT NULL DEFAULT 0,
ADD COLUMN     "commission" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "riderCutRate" DECIMAL(4,1) NOT NULL DEFAULT 0,
ADD COLUMN     "riderCut" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Orders from before this change get the starting rates, so the reports have a history to show
UPDATE "Order" SET
  "commissionRate" = CASE WHEN fulfillment = 'DELIVERY' THEN 10 ELSE 5 END,
  "commission" = round(subtotal * CASE WHEN fulfillment = 'DELIVERY' THEN 10 ELSE 5 END / 100, 2),
  "riderCutRate" = CASE WHEN fulfillment = 'DELIVERY' THEN 10 ELSE 0 END,
  "riderCut" = CASE WHEN fulfillment = 'DELIVERY' THEN round("deliveryFee" * 10 / 100, 2) ELSE 0 END;

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "riderId" TEXT,
    "owedToFeasto" DECIMAL(12,2) NOT NULL,
    "owedByFeasto" DECIMAL(12,2) NOT NULL,
    "orders" INTEGER NOT NULL,
    "settledById" TEXT,
    "settledByName" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id"),
    -- A settlement is with one store or one rider, never both or neither
    CONSTRAINT "Settlement_one_party" CHECK (("vendorId" IS NULL) <> ("riderId" IS NULL))
);

-- CreateIndex
CREATE INDEX "Settlement_vendorId_createdAt_idx" ON "Settlement"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "Settlement_riderId_createdAt_idx" ON "Settlement"("riderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
