-- Phase 1, security: two-step login with an authenticator app (required for admins and store
-- owners while require2fa is on), the devices each account has signed in from (for "new sign-in"
-- alerts and "remember this device"), and the automatic check of uploaded IDs and permits.
ALTER TABLE "User"
  ADD COLUMN "totpSecret" TEXT,
  ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "PlatformSettings" ADD COLUMN "require2fa" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "trustedUntil" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnownDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnownDevice_userId_deviceHash_key" ON "KnownDevice"("userId", "deviceHash");
ALTER TABLE "KnownDevice" ADD CONSTRAINT "KnownDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "DocVerdict" AS ENUM ('LOOKS_REAL', 'REVIEW', 'NOT_A_DOCUMENT', 'NOT_CHECKED');

CREATE TABLE "DocumentCheck" (
    "id" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "verdict" "DocVerdict" NOT NULL,
    "documentType" TEXT,
    "nameOnDocument" TEXT,
    "birthDate" TEXT,
    "expiresOn" TEXT,
    "nameMatches" BOOLEAN,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "numberHash" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentCheck_file_key" ON "DocumentCheck"("file");
CREATE INDEX "DocumentCheck_numberHash_idx" ON "DocumentCheck"("numberHash");
CREATE INDEX "DocumentCheck_userId_idx" ON "DocumentCheck"("userId");
