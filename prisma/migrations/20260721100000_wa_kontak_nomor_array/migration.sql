-- AlterTable: ubah nomor dari TEXT ke TEXT[] jika belum TEXT[]
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WaKontak'
      AND column_name = 'nomor'
      AND data_type = 'text'
      AND array_dimensions IS NULL
  ) THEN
    ALTER TABLE "WaKontak" ALTER COLUMN "nomor" TYPE TEXT[] USING ARRAY["nomor"];
  END IF;
END $$;
