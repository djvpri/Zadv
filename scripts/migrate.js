const { execSync } = require('child_process')

try {
  console.log('Menjalankan db push...')
  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' })
  console.log('Migrasi selesai ✓')
} catch (e) {
  console.error('Migrasi gagal (server tetap dilanjutkan start):', e.message)
  // Sengaja tidak exit(1) — kalau DB sudah sesuai/migrasi sebelumnya sudah
  // jalan, jangan sampai server gagal start cuma karena ini re-run gagal.
  process.exit(0)
}
