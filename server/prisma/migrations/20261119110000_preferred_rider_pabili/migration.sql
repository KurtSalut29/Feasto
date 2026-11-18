-- Preferred rider: a resident can ask for a rider at checkout; the job reaches them alone first.
-- Pabili: errands at shops that aren't on Feasto.

-- AlterEnum
ALTER TYPE "JobDispatch" ADD VALUE 'PREFERRED';

-- CreateEnum
CREATE TYPE "ErrandStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'BOUGHT', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "preferredRiderId" TEXT;

-- CreateTable
CREATE TABLE "Errand" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "riderId" TEXT,
    "preferredRiderId" TEXT,
    "exclusiveUntil" TIMESTAMP(3),
    "shopName" TEXT NOT NULL,
    "shopAddress" TEXT NOT NULL,
    "shopLat" DOUBLE PRECISION NOT NULL,
    "shopLng" DOUBLE PRECISION NOT NULL,
    "items" JSONB NOT NULL,
    "notes" TEXT,
    "budget" DECIMAL(10,2) NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryLat" DOUBLE PRECISION,
    "deliveryLng" DOUBLE PRECISION,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "receiptTotal" DECIMAL(10,2),
    "receiptPhotoUrl" TEXT,
    "deliveryPhotoUrl" TEXT,
    "status" "ErrandStatus" NOT NULL DEFAULT 'REQUESTED',
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "boughtAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Errand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Errand_status_createdAt_idx" ON "Errand"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Errand_riderId_status_idx" ON "Errand"("riderId", "status");

-- CreateIndex
CREATE INDEX "Errand_residentId_createdAt_idx" ON "Errand"("residentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_preferredRiderId_fkey" FOREIGN KEY ("preferredRiderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Errand" ADD CONSTRAINT "Errand_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Errand" ADD CONSTRAINT "Errand_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Errand" ADD CONSTRAINT "Errand_preferredRiderId_fkey" FOREIGN KEY ("preferredRiderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
