-- CreateTable
CREATE TABLE "WaKontak" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "grup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaKontak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaKontak_grup_idx" ON "WaKontak"("grup");
