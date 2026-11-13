-- Real online payments through Xendit (test mode): the invoice behind each online checkout, and
-- refunds for orders cancelled or declined after the resident paid.

-- AlterTable
ALTER TABLE "Checkout" ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "paidChannel" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundNote" TEXT;

-- Orders already given back before refunds were tracked per order
UPDATE "Order" o SET "refundedAt" = o."finishedAt", "refundNote" = 'Simulated refund'
FROM "Checkout" c
WHERE c.id = o."checkoutId" AND c."paymentMethod" = 'ONLINE' AND c."paymentStatus" = 'REFUNDED' AND o.status IN ('CANCELLED', 'REJECTED');

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_paymentRef_key" ON "Checkout"("paymentRef");
