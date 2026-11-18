-- A store whose business permit stayed expired past the grace period stops taking orders until it's renewed.
-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "permitPausedAt" TIMESTAMP(3);
