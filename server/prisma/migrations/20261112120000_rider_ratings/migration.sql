-- AlterTable
ALTER TABLE "RiderProfile" ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingSum" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "tip" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tipMethod" "OnlinePayment";

-- CreateTable
CREATE TABLE "RiderRating" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderRating_orderId_key" ON "RiderRating"("orderId");

-- CreateIndex
CREATE INDEX "RiderRating_riderId_createdAt_idx" ON "RiderRating"("riderId", "createdAt");

-- AddForeignKey
ALTER TABLE "RiderRating" ADD CONSTRAINT "RiderRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderRating" ADD CONSTRAINT "RiderRating_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderRating" ADD CONSTRAINT "RiderRating_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

