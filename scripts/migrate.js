const { execSync } = require('child_process')

try {
  console.log('Menjalankan db push...')
  // --accept-data-loss diperlukan saat ada perubahan tipe kolom (mis. TEXT -> TEXT[])
  execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' })
  console.log('Migrasi selesai ✓')
} catch (e) {
  console.error('Migrasi gagal (server tetap dilanjutkan start):', e.message)
  process.exit(0)
}
