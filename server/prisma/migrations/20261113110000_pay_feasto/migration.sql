-- Stores and riders can pay what they owe Feasto from cash orders in the app, with an e-wallet
-- or card (simulated). Empty means they handed it to the admin in person.

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "method" "OnlinePayment";
