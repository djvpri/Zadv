const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const ZONE_DATA = {
  nama: 'ZOne',
  emoji: '🌐',
  tagline: 'Jadikan Ekosistem Zomet Sumber Penghasilan — Komisi Tiap Referral',
  fitur: [
    'Komisi menarik tiap referral berlangganan app Zomet',
    '13+ aplikasi SaaS siap dipasarkan (ZBilliar, ZGym, ZResto, ZLaundry, dll)',
    'Dashboard mitra real-time: pantau klik, referral & komisi',
    'Link referral unik per mitra, mudah dibagikan di WhatsApp & medsos',
    'Payout bulanan otomatis langsung ke rekening',
    'Materi promosi siap pakai: caption, poster, skrip video',
    'Tanpa modal, tanpa stok — murni komisi dari penjualan',
    'SSO satu akun untuk akses semua app Zomet',
    'Komunitas mitra aktif + panduan pemasaran lengkap',
  ],
  accent: '#2563EB',
  tint: '#EBF1FF',
  url: 'https://zone.zomet.my.id',
}

async function main() {
  const existing = await p.promoApp.findFirst({ where: { nama: 'ZOne' } })

  if (existing) {
    await p.promoApp.update({
      where: { id: existing.id },
      data: ZONE_DATA,
    })
    console.log(`ZOne (id=${existing.id}) berhasil diupdate ✓`)
  } else {
    const created = await p.promoApp.create({ data: { ...ZONE_DATA, urutan: 0 } })
    console.log(`ZOne dibuat baru dengan id=${created.id} ✓`)
  }
}

main().catch((e) => console.error(e)).finally(() => p.$disconnect())
