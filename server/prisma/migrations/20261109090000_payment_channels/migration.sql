-- CreateEnum
CREATE TYPE "OnlinePayment" AS ENUM ('GCASH', 'MAYA', 'GRABPAY', 'SHOPEEPAY', 'COINS', 'VISA', 'MASTERCARD', 'JCB', 'AMEX');

-- AlterTable
ALTER TABLE "Checkout" ADD COLUMN "onlineMethod" "OnlinePayment";
