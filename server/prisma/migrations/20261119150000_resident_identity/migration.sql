-- Sign-up asks for the name in parts (first, middle, last, suffix), and a resident uploads a valid ID
-- that the admin checks.
-- CreateEnum
CREATE TYPE "IdCheck" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "suffix" TEXT,
ADD COLUMN     "idType" TEXT,
ADD COLUMN     "idFile" TEXT,
ADD COLUMN     "idStatus" "IdCheck",
ADD COLUMN     "idReviewNote" TEXT,
ADD COLUMN     "idReviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_role_idStatus_idx" ON "User"("role", "idStatus");
