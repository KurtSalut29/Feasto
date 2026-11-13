-- Online payments are now split as soon as an order is delivered or collected: the store and
-- the rider get their part right away. Only Feasto's share of cash orders is still settled by hand.

-- What was settled before this counted online orders too, so it no longer matches; start again
DELETE FROM "Settlement";

-- AlterTable
ALTER TABLE "Settlement" DROP COLUMN "owedByFeasto";
ALTER TABLE "Settlement" RENAME COLUMN "owedToFeasto" TO "amount";
