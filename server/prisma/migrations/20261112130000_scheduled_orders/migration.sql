-- Orders for later: a new status between paying and reaching the store
ALTER TYPE "OrderStatus" ADD VALUE 'SCHEDULED' BEFORE 'PLACED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- Every order so far reached its store when it was made
UPDATE "Order" SET "placedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "Order_status_scheduledFor_idx" ON "Order"("status", "scheduledFor");
