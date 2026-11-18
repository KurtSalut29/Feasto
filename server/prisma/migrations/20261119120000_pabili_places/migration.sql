-- Pabili places: shops not on Feasto that the admin pins once, so residents pick them instead of pinning.
-- CreateEnum
CREATE TYPE "PabiliPlaceKind" AS ENUM ('MARKET', 'PHARMACY', 'GROCERY', 'HARDWARE', 'SARI_SARI', 'OTHER');

-- CreateTable
CREATE TABLE "PabiliPlace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PabiliPlaceKind" NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PabiliPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PabiliPlace_isActive_name_idx" ON "PabiliPlace"("isActive", "name");

-- AlterTable: which listed place a Pabili is from, and the fee correction from the rider's GPS
ALTER TABLE "Errand" ADD COLUMN "placeId" TEXT,
ADD COLUMN "quotedFee" DECIMAL(10,2),
ADD COLUMN "shopMovedKm" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "Errand" ADD CONSTRAINT "Errand_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "PabiliPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
