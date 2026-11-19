-- CreateEnum
CREATE TYPE "ReceiveChannel" AS ENUM ('GCASH', 'MAYA', 'BANK');

-- CreateEnum
CREATE TYPE "PayMethodKind" AS ENUM ('GCASH', 'MAYA', 'CARD');

-- AlterTable
ALTER TABLE "Checkout" ADD COLUMN     "transferAccountId" TEXT,
ADD COLUMN     "transferCheckedAt" TIMESTAMP(3),
ADD COLUMN     "transferFrom" TEXT,
ADD COLUMN     "transferNote" TEXT,
ADD COLUMN     "transferProof" TEXT,
ADD COLUMN     "transferRef" TEXT,
ADD COLUMN     "transferSentAt" TIMESTAMP(3),
ADD COLUMN     "transferTo" TEXT;

-- CreateTable
CREATE TABLE "ReceivingAccount" (
    "id" TEXT NOT NULL,
    "channel" "ReceiveChannel" NOT NULL,
    "bankName" TEXT,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "qrUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPayMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PayMethodKind" NOT NULL,
    "holderName" TEXT NOT NULL,
    "number" TEXT,
    "brand" "OnlinePayment",
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPayMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPayMethod_userId_idx" ON "SavedPayMethod"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_transferRef_key" ON "Checkout"("transferRef");

-- CreateIndex
CREATE INDEX "Checkout_transferSentAt_idx" ON "Checkout"("transferSentAt");

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_transferAccountId_fkey" FOREIGN KEY ("transferAccountId") REFERENCES "ReceivingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPayMethod" ADD CONSTRAINT "SavedPayMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

