-- AlterTable: tambah kolom untuk scheduled + foto + ide
ALTER TABLE "ArtikelDraft" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "ArtikelDraft" ADD COLUMN "fotoId" INTEGER;
ALTER TABLE "ArtikelDraft" ADD COLUMN "ideId" INTEGER;
ALTER TABLE "ArtikelDraft" ALTER COLUMN "status" SET DEFAULT 'draft';

-- Index untuk scheduled lookup
CREATE INDEX "ArtikelDraft_scheduledFor_idx" ON "ArtikelDraft"("scheduledFor");
CREATE INDEX "ArtikelDraft_status_scheduledFor_idx" ON "ArtikelDraft"("status", "scheduledFor");

-- CreateTable: ArtikelIde
CREATE TABLE "ArtikelIde" (
    "id" SERIAL NOT NULL,
    "appId" INTEGER,
    "teks" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "artikelId" INTEGER,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtikelIde_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArtikelIde_appId_status_idx" ON "ArtikelIde"("appId", "status");
CREATE INDEX "ArtikelIde_status_idx" ON "ArtikelIde"("status");

-- AddForeignKey untuk ArtikelIde
ALTER TABLE "ArtikelIde" ADD CONSTRAINT "ArtikelIde_appId_fkey"
  FOREIGN KEY ("appId") REFERENCES "PromoApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ArtikelFoto
CREATE TABLE "ArtikelFoto" (
    "id" SERIAL NOT NULL,
    "appId" INTEGER,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtikelFoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArtikelFoto_appId_idx" ON "ArtikelFoto"("appId");
CREATE INDEX "ArtikelFoto_tags_idx" ON "ArtikelFoto" USING GIN ("tags");

-- AddForeignKey untuk ArtikelFoto
ALTER TABLE "ArtikelFoto" ADD CONSTRAINT "ArtikelFoto_appId_fkey"
  FOREIGN KEY ("appId") REFERENCES "PromoApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
