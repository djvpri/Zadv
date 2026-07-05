# Meja Promosi (ZPromo)

Internal tool untuk generate caption & poster promosi tiap app di ekosistem Zomet. Cuma untuk Andi sendiri — login pakai password tunggal, bukan SSO Z One.

## Fitur
- **Meja Cetak** — pilih app, atur platform & nada bicara, generate caption via Claude API. Poster bisa diunduh sebagai PNG.
- **Riwayat** — semua caption yang pernah dibuat tersimpan, bisa disalin ulang.
- **Kelola App** — tambah/edit/hapus app yang mau dipromosikan (nama, tagline, fitur, warna).

## Setup lokal
```bash
npm install
cp .env.example .env   # isi DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD, ANTHROPIC_API_KEY
npx prisma db push
npm run seed            # isi 8 app awal (ZGold, ZBengkel, dst)
npm run dev
```

## Env yang wajib diisi di Railway
| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | PostgreSQL Railway |
| `JWT_SECRET` | random panjang, buat sendiri (`openssl rand -hex 32`) |
| `ADMIN_PASSWORD` | password login kamu sendiri |
| `ANTHROPIC_API_KEY` | API key dari console.anthropic.com |

## Setelah deploy pertama kali
Jalankan sekali di Railway shell:
```bash
npm run seed
```
Ini mengisi 8 app awal (ZGold, ZBengkel, ZBilliar, ZPOS, ZGym, Z-Resto, Z-Absen, Z-Rooms) supaya tidak mulai dari kosong. Aman dijalankan berkali-kali — otomatis dilewati kalau sudah ada data.

## Tidak terhubung ke Z One
App ini **berdiri sendiri** — tidak pakai SSO, tidak baca database Z One. Daftar app yang mau dipromosikan dikelola manual lewat halaman "Kelola App", bukan otomatis sinkron dari ekosistem.
