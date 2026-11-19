-- The most a rider may spend on one Pabili is now an admin setting instead of a fixed 1000.
ALTER TABLE "PlatformSettings" ADD COLUMN "pabiliBudgetMax" INTEGER NOT NULL DEFAULT 1000;
