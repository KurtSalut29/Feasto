-- Phase 1, orders: the store says when an order will be ready (and when it runs late), a busy
-- kitchen adds time, each store delivers within its own distance, big orders need notice and an
-- online payment, an item that ran out can be taken off, and a customer who never comes to the
-- door is recorded.
CREATE TYPE "IfUnavailable" AS ENUM ('REMOVE', 'CALL', 'CANCEL');

ALTER TABLE "Vendor"
  ADD COLUMN "prepMinutes" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "prepPer5Items" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "busyExtraMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "busyUntil" TIMESTAMP(3),
  ADD COLUMN "deliveryRadiusKm" DECIMAL(4,1) NOT NULL DEFAULT 7,
  ADD COLUMN "largeOrderNoticeMinutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PlatformSettings"
  ADD COLUMN "largeOrderItems" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "largeOrderAmount" INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN "codMaxAmount" INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN "noShowStrikes" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "doorWaitMinutes" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "Order"
  ADD COLUMN "readyBy" TIMESTAMP(3),
  ADD COLUMN "delays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "delayNote" TEXT,
  ADD COLUMN "arrivedAt" TIMESTAMP(3),
  ADD COLUMN "noShow" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Checkout" ADD COLUMN "ifUnavailable" "IfUnavailable" NOT NULL DEFAULT 'REMOVE';

ALTER TABLE "OrderItem" ADD COLUMN "removedAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "noShows" INTEGER NOT NULL DEFAULT 0;
