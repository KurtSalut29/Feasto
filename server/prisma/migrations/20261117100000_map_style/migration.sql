-- Map style (the usual map, satellite or night), saved with the account like the other display settings.
-- CreateEnum
CREATE TYPE "MapStyle" AS ENUM ('DEFAULT', 'SATELLITE', 'NIGHT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mapStyle" "MapStyle" NOT NULL DEFAULT 'DEFAULT';

