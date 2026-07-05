const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const APPS = [
  { nama: 'ZGold', emoji: '💎', tagline: 'POS Toko Emas & Perhiasan', fitur: ['Multi-logam (emas/perak/platinum)', 'Hitung kadar & berat otomatis', 'Barcode scan produk'], accent: '#D97706', tint: '#FEF3E2', urutan: 1 },
  { nama: 'ZBengkel', emoji: '🔧', tagline: 'Sistem Manajemen Bengkel', fitur: ['Work order & antrian servis', 'Data spare part & mekanik', 'Riwayat servis per kendaraan'], accent: '#EA580C', tint: '#FFF1EA', urutan: 2 },
  { nama: 'ZBilliar', emoji: '🎱', tagline: 'Rental Biliar Digital', fitur: ['Timer real-time per meja', 'Kasir otomatis saat checkout', 'Warung F&B terintegrasi'], accent: '#0D9488', tint: '#E9FBF7', urutan: 3 },
  { nama: 'ZPOS', emoji: '🛒', tagline: 'Kasir Digital Modern', fitur: ['Scan barcode & foto produk', 'Laporan penjualan lengkap', 'Tetap jalan tanpa internet'], accent: '#2563EB', tint: '#EBF1FF', urutan: 4 },
  { nama: 'ZGym', emoji: '🏋️', tagline: 'Membership Gym & Fitness', fitur: ['Kelola member & perpanjangan', 'Jadwal kelas & instruktur', 'Cek-in otomatis'], accent: '#DC2626', tint: '#FFEEEE', urutan: 5 },
  { nama: 'Z-Resto', emoji: '🍽️', tagline: 'POS Restoran Multi-Cabang', fitur: ['Kelola meja & pesanan dapur', 'Menu & varian custom', 'Laporan tiap cabang'], accent: '#B45309', tint: '#FDF3E7', urutan: 6 },
  { nama: 'Z-Absen', emoji: '📍', tagline: 'Absensi Karyawan GPS', fitur: ['Verifikasi lokasi & wajah', 'Rekap kehadiran otomatis', 'Multi cabang/lokasi'], accent: '#0891B2', tint: '#EAFAFD', urutan: 7 },
  { nama: 'Z-Rooms', emoji: '🏢', tagline: 'Booking Ruang & Workspace', fitur: ['Reservasi ruang real-time', 'Kalender ketersediaan', 'Kelola member berulang'], accent: '#7C3AED', tint: '#F4EEFF', urutan: 8 },
]

async function seed() {
  const jumlah = await p.promoApp.count()
  if (jumlah > 0) {
    console.log(`Sudah ada ${jumlah} app tersimpan, seed dilewati.`)
    return
  }
  for (const app of APPS) {
    await p.promoApp.create({ data: app })
    console.log('✓', app.nama)
  }
  console.log('Seed selesai.')
}

seed().catch((e) => console.error(e)).finally(() => p.$disconnect())
