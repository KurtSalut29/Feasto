-- Feasto now takes motorcycle riders only: anyone on another vehicle stops getting jobs.
UPDATE "RiderProfile"
SET "status" = 'SUSPENDED', "isOnline" = false, "reviewedAt" = NOW(),
    "reviewNote" = 'Feasto now accepts motorcycle riders only.'
WHERE "vehicleType" <> 'MOTORCYCLE' AND "status" = 'APPROVED';
UPDATE "RiderProfile"
SET "status" = 'REJECTED', "reviewedAt" = NOW(),
    "reviewNote" = 'Feasto now accepts motorcycle riders only.'
WHERE "vehicleType" <> 'MOTORCYCLE' AND "status" = 'PENDING';

ALTER TABLE "RiderProfile" DROP COLUMN "vehicleType";
DROP TYPE "VehicleType";

-- Rider details and license
ALTER TABLE "RiderProfile"
  ADD COLUMN "vehicleModel" TEXT,
  ADD COLUMN "licenseExpiresAt" DATE,
  ADD COLUMN "licenseFile" TEXT,
  ADD COLUMN "birthDate" DATE,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "emergencyName" TEXT,
  ADD COLUMN "emergencyPhone" TEXT,
  ADD COLUMN "vendorId" TEXT,
  ADD COLUMN "suspendedByAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Store details and business permit
ALTER TABLE "Vendor"
  ADD COLUMN "businessName" TEXT,
  ADD COLUMN "businessPhone" TEXT,
  ADD COLUMN "permitNumber" TEXT,
  ADD COLUMN "permitExpiresAt" DATE,
  ADD COLUMN "permitFile" TEXT,
  ADD COLUMN "riderCode" TEXT;

-- Every existing store gets its own code for its riders
UPDATE "Vendor" SET "riderCode" = UPPER(SUBSTR(MD5("id"), 1, 4) || '-' || SUBSTR(MD5("id"), 5, 4));
ALTER TABLE "Vendor" ALTER COLUMN "riderCode" SET NOT NULL;
CREATE UNIQUE INDEX "Vendor_riderCode_key" ON "Vendor"("riderCode");

CREATE INDEX "RiderProfile_vendorId_status_idx" ON "RiderProfile"("vendorId", "status");
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
