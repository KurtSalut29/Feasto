-- Reports: anyone on an order, Pabili or booking can report the others in it; the admin dismisses, warns or suspends.
-- A suspended account can sign in but can't order, take jobs or get orders until suspendedUntil.

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('PRANK_ORDER', 'NO_SHOW', 'RUDE', 'UNSAFE_DRIVING', 'WRONG_ITEMS', 'OFF_APP_PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'WARNED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reporterRole" "Role" NOT NULL,
    "reportedId" TEXT NOT NULL,
    "reportedRole" "Role" NOT NULL,
    "orderId" TEXT,
    "errandId" TEXT,
    "bookingId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT NOT NULL,
    "photoUrl" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "adminNote" TEXT,
    "suspendedUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedByName" TEXT,
    "warningSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reportedId_createdAt_idx" ON "Report"("reportedId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_reportedId_orderId_key" ON "Report"("reporterId", "reportedId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_reportedId_errandId_key" ON "Report"("reporterId", "reportedId", "errandId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_reportedId_bookingId_key" ON "Report"("reporterId", "reportedId", "bookingId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_errandId_fkey" FOREIGN KEY ("errandId") REFERENCES "Errand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

