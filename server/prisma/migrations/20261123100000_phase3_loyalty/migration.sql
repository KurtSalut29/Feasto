-- Phase 3: Suki. Points earned on delivered orders and spent at checkout (Feasto pays them), tiers from
-- the last 30 days, missions, inviting friends, and a birthday gift.

CREATE TYPE "PointsReason" AS ENUM ('MISSION', 'REFERRAL', 'BIRTHDAY', 'ADMIN');
CREATE TYPE "MissionKind" AS ENUM ('ORDERS', 'NEW_STORES', 'SPEND');
CREATE TYPE "MissionPeriod" AS ENUM ('WEEK', 'MONTH');

ALTER TABLE "User" ADD COLUMN "referralCode" TEXT, ADD COLUMN "referredById" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "pointsEarned" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pointsUsed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PlatformSettings"
  ADD COLUMN "loyaltyOn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pointsEarnPer" DECIMAL(8,2) NOT NULL DEFAULT 20,
  ADD COLUMN "pointValue" DECIMAL(6,2) NOT NULL DEFAULT 0.20,
  ADD COLUMN "pointsMinRedeem" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "referralPoints" INTEGER NOT NULL DEFAULT 250,
  ADD COLUMN "birthdayPoints" INTEGER NOT NULL DEFAULT 250;

CREATE TABLE "PointsGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" "PointsReason" NOT NULL,
    "key" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointsGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PointsGrant_userId_key_key" ON "PointsGrant"("userId", "key");
CREATE INDEX "PointsGrant_userId_createdAt_idx" ON "PointsGrant"("userId", "createdAt");
ALTER TABLE "PointsGrant" ADD CONSTRAINT "PointsGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "MissionKind" NOT NULL,
    "target" INTEGER NOT NULL,
    "period" "MissionPeriod" NOT NULL,
    "rewardPoints" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- Starting missions (the admin changes or pauses them in Admin > Promos)
INSERT INTO "Mission" ("id", "title", "kind", "target", "period", "rewardPoints") VALUES
  ('mission_orders_week', 'Order 3 times this week', 'ORDERS', 3, 'WEEK', 250),
  ('mission_new_stores_month', 'Try 3 stores you haven''t ordered from, this month', 'NEW_STORES', 3, 'MONTH', 250),
  ('mission_spend_month', 'Spend ₱1,500 on food this month', 'SPEND', 1500, 'MONTH', 300);
