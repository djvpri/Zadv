-- AlterTable: ubah nomor dari TEXT ke TEXT[]
ALTER TABLE "WaKontak" ALTER COLUMN "nomor" TYPE TEXT[] USING ARRAY["nomor"];
