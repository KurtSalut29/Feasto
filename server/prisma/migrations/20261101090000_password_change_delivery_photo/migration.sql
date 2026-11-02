-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryPhotoUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);
