-- Phase 1, money: riders keep the whole food delivery fee, Feasto takes a share of the Pabili fee,
-- each store can have its own commission, and the fixed rush hours give way to add-ons from what is
-- really happening (orders waiting for riders, and rain).
ALTER TABLE "PlatformSettings"
  DROP COLUMN "deliveryPeakFee",
  DROP COLUMN "peakHours",
  DROP COLUMN "riderFeePercent",
  ADD COLUMN "pabiliFeePercent" DECIMAL(4,1) NOT NULL DEFAULT 10,
  ADD COLUMN "busyFeeMax" DECIMAL(10,2) NOT NULL DEFAULT 20,
  ADD COLUMN "rainFee" DECIMAL(10,2) NOT NULL DEFAULT 10;

ALTER TABLE "Vendor"
  ADD COLUMN "commissionPercent" DECIMAL(4,1),
  ADD COLUMN "pickupCommissionPercent" DECIMAL(4,1),
  ADD COLUMN "commissionNote" TEXT,
  ADD COLUMN "commissionSetAt" TIMESTAMP(3);

ALTER TABLE "Order"
  ADD COLUMN "extraFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "extraFeeNote" TEXT;

ALTER TABLE "Errand"
  ADD COLUMN "extraFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "extraFeeNote" TEXT,
  ADD COLUMN "feastoCutRate" DECIMAL(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN "feastoCut" DECIMAL(10,2) NOT NULL DEFAULT 0;
