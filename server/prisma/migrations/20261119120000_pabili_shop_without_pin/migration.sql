-- A Pabili shop has no map pin: the resident types its name and where it is. Its spot (and the
-- exact delivery fee) comes from the rider's phone when they buy; until then the fee is a range.
ALTER TABLE "Errand" ALTER COLUMN "shopLat" DROP NOT NULL,
ALTER COLUMN "shopLng" DROP NOT NULL,
ADD COLUMN "feeMax" DECIMAL(10,2);
