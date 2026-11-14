-- Display & accessibility settings, saved with the account so they follow the person to any device.

-- CreateEnum
CREATE TYPE "TextSize" AS ENUM ('NORMAL', 'LARGE', 'XLARGE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "textSize" "TextSize" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "highContrast" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "largeTargets" BOOLEAN NOT NULL DEFAULT false;
