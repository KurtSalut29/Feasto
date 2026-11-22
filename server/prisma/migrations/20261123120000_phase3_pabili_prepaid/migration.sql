-- Phase 3: a Pabili paid online first. Feasto pays the rider back (a payout for the errand, not an order),
-- and the wait for a rider starts once it's paid.

ALTER TABLE "Payout" ALTER COLUMN "orderId" DROP NOT NULL, ADD COLUMN "errandId" TEXT;
CREATE UNIQUE INDEX "Payout_errandId_party_key" ON "Payout"("errandId", "party");
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_errandId_fkey" FOREIGN KEY ("errandId") REFERENCES "Errand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Errand" ADD COLUMN "paidAt" TIMESTAMP(3);
