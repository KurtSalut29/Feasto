-- Phase 2, Daloy step 1: record how fast riders really ride, from their phones' positions on a job.
-- Each ride of a job (to the store, to the door, to the Pabili shop) is logged with Feasto's estimate,
-- and the metres and seconds are added up per square of the map and 15 minutes (no rider kept there).

CREATE TYPE "TripLegKind" AS ENUM ('TO_STORE', 'TO_DOOR', 'TO_SHOP');

CREATE TABLE "TripLeg" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "errandId" TEXT,
    "riderId" TEXT NOT NULL,
    "kind" "TripLegKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "riddenKm" DECIMAL(6,2) NOT NULL,
    "straightKm" DECIMAL(6,2) NOT NULL,
    "movingSeconds" INTEGER NOT NULL,
    "stoppedSeconds" INTEGER NOT NULL,
    "expectedMinutes" INTEGER,
    "points" INTEGER NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripLeg_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TripLeg_orderId_kind_key" ON "TripLeg"("orderId", "kind");
CREATE UNIQUE INDEX "TripLeg_errandId_kind_key" ON "TripLeg"("errandId", "kind");
CREATE INDEX "TripLeg_endedAt_idx" ON "TripLeg"("endedAt");
ALTER TABLE "TripLeg" ADD CONSTRAINT "TripLeg_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripLeg" ADD CONSTRAINT "TripLeg_errandId_fkey" FOREIGN KEY ("errandId") REFERENCES "Errand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TravelSample" (
    "id" TEXT NOT NULL,
    "cell" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "meters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "samples" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TravelSample_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TravelSample_cell_bucket_demo_key" ON "TravelSample"("cell", "bucket", "demo");
CREATE INDEX "TravelSample_bucket_idx" ON "TravelSample"("bucket");
