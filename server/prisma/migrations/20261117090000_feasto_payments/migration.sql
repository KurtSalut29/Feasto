-- Stores and riders pay Feasto its share of their cash orders on Xendit's payment page (test
-- mode). It turns into a Settlement only once Xendit confirms the money arrived.
-- CreateTable
CREATE TABLE "FeastoPayment" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "riderId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "orders" INTEGER NOT NULL,
    "method" "OnlinePayment" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceId" TEXT,
    "invoiceUrl" TEXT,
    "paidChannel" TEXT,
    "failure" TEXT,
    "settlementId" TEXT,
    "paidById" TEXT NOT NULL,
    "paidByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeastoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeastoPayment_invoiceId_key" ON "FeastoPayment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "FeastoPayment_settlementId_key" ON "FeastoPayment"("settlementId");

-- CreateIndex
CREATE INDEX "FeastoPayment_vendorId_status_idx" ON "FeastoPayment"("vendorId", "status");

-- CreateIndex
CREATE INDEX "FeastoPayment_riderId_status_idx" ON "FeastoPayment"("riderId", "status");

-- CreateIndex
CREATE INDEX "FeastoPayment_status_createdAt_idx" ON "FeastoPayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "FeastoPayment" ADD CONSTRAINT "FeastoPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeastoPayment" ADD CONSTRAINT "FeastoPayment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeastoPayment" ADD CONSTRAINT "FeastoPayment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

