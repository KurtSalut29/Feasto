-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('APPROVALS', 'DOCUMENTS', 'ACCOUNTS', 'ORDERS', 'SETTINGS');

-- CreateTable
CREATE TABLE "DocumentRenewal" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "riderId" TEXT,
    "number" TEXT,
    "expiresAt" DATE,
    "file" TEXT,
    "status" "RenewalStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRenewal_pkey" PRIMARY KEY ("id"),
    -- A renewal belongs to either a store or a rider, never both
    CONSTRAINT "DocumentRenewal_one_owner" CHECK (("vendorId" IS NULL) <> ("riderId" IS NULL))
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "category" "ActivityCategory" NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 49,
    "storeRiderSeconds" INTEGER NOT NULL DEFAULT 60,
    "riderWaveSeconds" INTEGER NOT NULL DEFAULT 30,
    "stuckMinutes" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id"),
    -- There is only ever one row of settings
    CONSTRAINT "PlatformSettings_single_row" CHECK ("id" = 1)
);

-- CreateIndex
CREATE INDEX "DocumentRenewal_status_submittedAt_idx" ON "DocumentRenewal"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "DocumentRenewal_vendorId_idx" ON "DocumentRenewal"("vendorId");

-- CreateIndex
CREATE INDEX "DocumentRenewal_riderId_idx" ON "DocumentRenewal"("riderId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_category_createdAt_idx" ON "ActivityLog"("category", "createdAt");

-- AddForeignKey
ALTER TABLE "DocumentRenewal" ADD CONSTRAINT "DocumentRenewal_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRenewal" ADD CONSTRAINT "DocumentRenewal_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Each store or rider has at most one renewal in progress, whichever API copy handles the request
CREATE UNIQUE INDEX "DocumentRenewal_one_open_per_store" ON "DocumentRenewal"("vendorId") WHERE "status" IN ('DRAFT', 'PENDING');
CREATE UNIQUE INDEX "DocumentRenewal_one_open_per_rider" ON "DocumentRenewal"("riderId") WHERE "status" IN ('DRAFT', 'PENDING');

-- Feasto has one admin. The database refuses a second one, however it's attempted.
CREATE UNIQUE INDEX "User_one_admin" ON "User"("role") WHERE "role" = 'ADMIN';
