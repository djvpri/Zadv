// Self-check (tanpa framework): verifikasi logika pure script artikel harian.
// Jalankan: npx tsx scripts/artikel-harian.test.ts
import assert from 'node:assert'
import { pilihAppIdx } from './artikel-harian'

function cek(nama: string, fn: () => void) {
  fn()
  console.log('OK ', nama)
}

// Rotasi: lanjut ke app berikutnya setelah last-published, wrap ke awal.
const apps = [1, 2, 3, 4, 5]
cek('pilih app pertama saat belum pernah publish', () => assert.equal(pilihAppIdx(apps, null), 0))
cek('lanjut app berikutnya', () => assert.equal(pilihAppIdx(apps, 1), 1))
cek('wrap dari akhir ke awal', () => assert.equal(pilihAppIdx(apps, 5), 0))
cek('lastAppId tak ada di daftar → app pertama', () => assert.equal(pilihAppIdx(apps, 99), 0))
cek('app baru (id 6) jadi giliran berikutnya', () => assert.equal(pilihAppIdx([...apps, 6], 5), 5))

console.log('SEMUA PASS.')
