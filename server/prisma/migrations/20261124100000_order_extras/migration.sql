-- The last order gaps from the plan: a store's minimum order, a pickup code and a PIN at the door,
-- editing an order before the store accepts it, pausing deliveries in a storm, "no cutlery" and
-- "leave at the gate", and reporting a problem after delivery (refund or credit).

ALTER TABLE "Vendor" ADD COLUMN "minOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "pickupCode" TEXT, ADD COLUMN "handoverPin" TEXT, ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "Checkout" ADD COLUMN "noCutlery" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "leaveAtGate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings"
  ADD COLUMN "deliveryPausedUntil" TIMESTAMP(3),
  ADD COLUMN "deliveryPauseReason" TEXT,
  ADD COLUMN "pinFromAmount" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "issueHours" INTEGER NOT NULL DEFAULT 24;
ALTER TYPE "PointsReason" ADD VALUE 'REFUND';

CREATE TYPE "IssueKind" AS ENUM ('MISSING_ITEM', 'WRONG_ITEM', 'DAMAGED', 'COLD_OR_LATE', 'OTHER');
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');
CREATE TYPE "IssuePayer" AS ENUM ('STORE', 'FEASTO');
CREATE TABLE "OrderIssue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "kind" "IssueKind" NOT NULL,
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paidBy" "IssuePayer",
    "given" TEXT,
    "answer" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderIssue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderIssue_orderId_idx" ON "OrderIssue"("orderId");
CREATE INDEX "OrderIssue_status_createdAt_idx" ON "OrderIssue"("status", "createdAt");
ALTER TABLE "OrderIssue" ADD CONSTRAINT "OrderIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
