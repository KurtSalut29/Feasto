-- Passkeys (fingerprint, face or screen lock) for every account, two-step login required for
-- riders too, and three steps for the admin (password, code and passkey) when switched on.

CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rpId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformSettings"
    ADD COLUMN "require2faRiders" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "require3faAdmin" BOOLEAN NOT NULL DEFAULT false;
