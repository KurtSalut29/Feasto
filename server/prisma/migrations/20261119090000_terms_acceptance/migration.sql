-- Terms of Service and Privacy Policy: when each person agreed, and to which version. Accounts made
-- before the terms existed stay empty.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
