-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "deliveryBaseKm" DECIMAL(4,1) NOT NULL DEFAULT 2,
ADD COLUMN     "deliveryPeakFee" DECIMAL(10,2) NOT NULL DEFAULT 10,
ADD COLUMN     "deliveryPerKm" DECIMAL(10,2) NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryKm" DECIMAL(5,1);

