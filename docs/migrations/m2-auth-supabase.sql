-- =============================================================================
-- Milestone 2 — Auth schema (run once in the Supabase SQL Editor)
-- Matches packages/database/prisma/schema.prisma. Safe to run on the existing DB.
-- =============================================================================

-- 1) New columns on the existing Owner table -------------------------------
ALTER TABLE "Owner"
    ADD COLUMN IF NOT EXISTS "mfaSecretEncrypted" TEXT,
    ADD COLUMN IF NOT EXISTS "mfaEnabledAt"        TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "passwordChangedAt"   TIMESTAMP(3);

-- 2) Session ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Session" (
    "id"         TEXT NOT NULL,
    "ownerId"    TEXT NOT NULL,
    "tokenHash"  TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt"  TIMESTAMP(3),
    "ipAddress"  TEXT,
    "userAgent"  TEXT,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX IF NOT EXISTS "Session_ownerId_idx"  ON "Session"("ownerId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

-- 3) RecoveryCode -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "RecoveryCode" (
    "id"        TEXT NOT NULL,
    "ownerId"   TEXT NOT NULL,
    "codeHash"  TEXT NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecoveryCode_ownerId_idx" ON "RecoveryCode"("ownerId");

-- 4) PasswordResetToken -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id"        TEXT NOT NULL,
    "ownerId"   TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_ownerId_idx" ON "PasswordResetToken"("ownerId");

-- 5) Foreign keys (owner -> child, delete children when owner deleted) -------
ALTER TABLE "Session"
    ADD CONSTRAINT "Session_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryCode"
    ADD CONSTRAINT "RecoveryCode_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) Lock down to the public API (our app connects as owner role, bypasses RLS)
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecoveryCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
