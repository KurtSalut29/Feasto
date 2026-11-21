-- Phase 2: discounts. Vouchers (Feasto's or a store's), stores' own deals on their dishes, free or
-- cheaper delivery, a first-order voucher, sale days (11.11, 12.12, payday), and the Senior and
-- PWD discount. Each order keeps what was taken off and who pays for it.

CREATE TYPE "PromoKind" AS ENUM ('VOUCHER', 'DEAL');
CREATE TYPE "PromoBenefit" AS ENUM ('PERCENT_OFF', 'AMOUNT_OFF', 'FREE_DELIVERY', 'DELIVERY_OFF');
CREATE TYPE "PromoFunder" AS ENUM ('FEASTO', 'STORE', 'SPLIT');
CREATE TYPE "PromoAudience" AS ENUM ('EVERYONE', 'FIRST_ORDER');

CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_endsAt_idx" ON "Campaign"("endsAt");

CREATE TABLE "Promo" (
    "id" TEXT NOT NULL,
    "kind" "PromoKind" NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "vendorId" TEXT,
    "benefit" "PromoBenefit" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2),
    "minSpend" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "funder" "PromoFunder" NOT NULL DEFAULT 'FEASTO',
    "storeShare" INTEGER NOT NULL DEFAULT 0,
    "audience" "PromoAudience" NOT NULL DEFAULT 'EVERYONE',
    "menuItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dailyFrom" INTEGER,
    "dailyTo" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "totalLimit" INTEGER,
    "budget" DECIMAL(10,2),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "campaignId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Promo_code_key" ON "Promo"("code");
CREATE INDEX "Promo_vendorId_kind_isActive_idx" ON "Promo"("vendorId", "kind", "isActive");
CREATE INDEX "Promo_kind_isActive_idx" ON "Promo"("kind", "isActive");
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Promo" ADD CONSTRAINT "Promo_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PromoUse" (
    "id" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "feastoAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "storeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoUse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromoUse_promoId_orderId_key" ON "PromoUse"("promoId", "orderId");
CREATE INDEX "PromoUse_userId_promoId_idx" ON "PromoUse"("userId", "promoId");
CREATE INDEX "PromoUse_orderId_idx" ON "PromoUse"("orderId");
ALTER TABLE "PromoUse" ADD CONSTRAINT "PromoUse_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoUse" ADD CONSTRAINT "PromoUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoUse" ADD CONSTRAINT "PromoUse_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- On each order: what was taken off, who pays for it, and the lines shown on the receipt
ALTER TABLE "Order"
    ADD COLUMN "storeDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "feastoDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "discounts" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "seniorDiscount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN "discount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Checkout" ADD COLUMN "discount" DECIMAL(10,2) NOT NULL DEFAULT 0;
