-- Stores and riders share one approval status. Rename the existing type instead of
-- dropping it, so every store keeps its current status, then add REJECTED.
ALTER TYPE "VendorStatus" RENAME TO "ApprovalStatus";
ALTER TYPE "ApprovalStatus" ADD VALUE 'REJECTED' BEFORE 'SUSPENDED';

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'BICYCLE', 'E_BIKE');

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RiderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "plateNumber" TEXT,
    "licenseNumber" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderProfile_userId_key" ON "RiderProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RiderProfile_licenseNumber_key" ON "RiderProfile"("licenseNumber");

-- AddForeignKey
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
