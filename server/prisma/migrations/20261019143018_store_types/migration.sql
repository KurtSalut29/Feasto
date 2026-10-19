-- CreateEnum
CREATE TYPE "StoreType" AS ENUM ('RESTAURANT', 'FAST_FOOD', 'CARINDERIA', 'CAFE', 'BAKERY', 'MILK_TEA_DRINKS', 'SNACKS_STREET_FOOD', 'DESSERTS', 'HOME_KITCHEN');

-- Existing stores become RESTAURANT; new stores must choose a type, so the default is removed afterwards.
ALTER TABLE "Vendor" ADD COLUMN "storeType" "StoreType" NOT NULL DEFAULT 'RESTAURANT',
ADD COLUMN "acceptsReservations" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vendor" ALTER COLUMN "storeType" DROP DEFAULT;
