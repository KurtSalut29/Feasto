-- Customers pages for stores and the admin: vouchers given only to the customers they pick.
ALTER TYPE "PromoAudience" ADD VALUE 'SELECTED';

CREATE TABLE "PromoRecipient" (
    "promoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoRecipient_pkey" PRIMARY KEY ("promoId", "userId")
);
CREATE INDEX "PromoRecipient_userId_idx" ON "PromoRecipient"("userId");
ALTER TABLE "PromoRecipient" ADD CONSTRAINT "PromoRecipient_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoRecipient" ADD CONSTRAINT "PromoRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
