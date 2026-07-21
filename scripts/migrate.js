const { execSync } = require('child_process')
const { Client } = require('pg')

async function fixNomorColumn() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    // Cek apakah kolom nomor di WaKontak masih TEXT (bukan TEXT[])
    const res = await client.query(`
      SELECT data_type, array_dimensions
      FROM information_schema.columns
      WHERE table_name = 'WaKontak' AND column_name = 'nomor'
    `)
    if (res.rows.length > 0 && res.rows[0].data_type === 'text' && !res.rows[0].array_dimensions) {
      console.log('WaKontak.nomor masih TEXT, mengubah ke TEXT[]...')
      await client.query(`ALTER TABLE "WaKontak" ALTER COLUMN "nomor" TYPE TEXT[] USING ARRAY["nomor"]`)
      console.log('WaKontak.nomor berhasil diubah ke TEXT[] ✓')
    }
  } catch (e) {
    console.error('fixNomorColumn gagal:', e.message)
  } finally {
    await client.end()
  }
}

async function main() {
  try {
    console.log('Menjalankan db push...')
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' })
    console.log('Migrasi selesai ✓')
  } catch (e) {
    console.error('Migrasi gagal (server tetap dilanjutkan):', e.message)
  }

  // Patch kolom yang tidak bisa di-handle db push secara aman
  await fixNomorColumn()
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(0) })
