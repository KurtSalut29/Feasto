-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "acceptsCash" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onlinePayments" "OnlinePayment"[] DEFAULT ARRAY['GCASH', 'MAYA', 'GRABPAY', 'SHOPEEPAY', 'COINS', 'VISA', 'MASTERCARD', 'JCB', 'AMEX']::"OnlinePayment"[];
