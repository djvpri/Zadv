-- CreateTable
CREATE TABLE IF NOT EXISTS "WaBlacklist" (
    "nomor" TEXT NOT NULL,
    "alasan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaBlacklist_pkey" PRIMARY KEY ("nomor")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WaRiwayat_nomor_sentAt_idx" ON "WaRiwayat"("nomor", "sentAt");
