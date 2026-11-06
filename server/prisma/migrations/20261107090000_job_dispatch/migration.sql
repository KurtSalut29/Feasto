-- How far a delivery job has spread among riders
CREATE TYPE "JobDispatch" AS ENUM ('NEW', 'STORE_RIDERS', 'NEAREST', 'WIDER', 'EVERYONE');

ALTER TABLE "Order"
  ADD COLUMN "dispatch" "JobDispatch" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "nextDispatchAt" TIMESTAMP(3);

CREATE INDEX "Order_nextDispatchAt_idx" ON "Order"("nextDispatchAt");

-- Jobs already waiting for a rider stay open to every free rider, as they were
UPDATE "Order" SET "dispatch" = 'EVERYONE'
WHERE "fulfillment" = 'DELIVERY' AND "riderId" IS NULL AND "status" IN ('ACCEPTED', 'PREPARING', 'READY');

-- Which free riders a job has reached so far
CREATE TABLE "JobOffer" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobOffer_orderId_riderId_key" ON "JobOffer"("orderId", "riderId");
CREATE INDEX "JobOffer_riderId_idx" ON "JobOffer"("riderId");

ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
