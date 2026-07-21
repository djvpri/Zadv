-- CreateTable
CREATE TABLE "WaRiwayat" (
    "id" SERIAL NOT NULL,
    "nomor" TEXT NOT NULL,
    "pesan" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL,
    "alasan" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaRiwayat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaRiwayat_sentAt_idx" ON "WaRiwayat"("sentAt");

-- CreateIndex
CREATE INDEX "WaRiwayat_status_idx" ON "WaRiwayat"("status");
