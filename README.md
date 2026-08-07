# Meja Promosi (ZPromo)

Internal tool untuk generate caption & poster promosi tiap app di ekosistem Zomet. Cuma untuk Andi sendiri — login pakai password tunggal, bukan SSO Z One.

## Fitur
- **Meja Cetak** — pilih app, atur platform & nada bicara, generate caption via Gemini API. Poster bisa diunduh sebagai PNG.
- **Video** — upload video durasi berapa pun, otomatis dipotong jadi ~60 detik (sampel dari depan/tengah/belakang, disambung — bukan cuma 1 menit pertama), ditambah caption di atasnya. Lihat "Cara kerja fitur Video" di bawah.
- **Riwayat** — semua caption yang pernah dibuat tersimpan, bisa disalin ulang.
- **Kelola App** — tambah/edit/hapus app yang mau dipromosikan (nama, tagline, fitur, warna).

## Setup lokal
```bash
npm install
cp .env.example .env   # isi DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD, GEMINI_API_KEY
npx prisma db push
npm run seed            # isi 8 app awal (ZGold, ZBengkel, dst)
npm run dev
```
Fitur Video butuh `ffmpeg` & `ffprobe` terpasang di sistem (sudah otomatis lewat Dockerfile di Railway; untuk dev lokal, pasang manual: `apt install ffmpeg` / `brew install ffmpeg`).

## Env yang wajib diisi di Railway
| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | PostgreSQL Railway |
| `JWT_SECRET` | random panjang, buat sendiri (`openssl rand -hex 32`) |
| `ADMIN_PASSWORD` | password login kamu sendiri |
| `GEMINI_API_KEY` | API key dari aistudio.google.com |
| `VIDEO_STORAGE_DIR` | path Railway Volume, mis. `/data/videos` — **wajib** kalau mau pakai fitur Video |

### Railway Volume untuk fitur Video (penting)
Video (asli & hasil olahan) disimpan sebagai file di disk, BUKAN di database — Postgres tidak cocok untuk simpan file besar. Ini butuh **Railway Volume** terpasang ke service zpromo:
1. Di service zpromo → tab **Settings** → **Volumes** → Add Volume
2. Mount path: `/data/videos` (atau path lain, samakan dengan `VIDEO_STORAGE_DIR`)
3. Tanpa Volume ini, fitur Video tetap jalan tapi file akan hilang setiap kali service di-restart/redeploy (karena filesystem container bersifat sementara)

## Setelah deploy pertama kali
Jalankan sekali di Railway shell:
```bash
npm run seed
```
Ini mengisi 8 app awal (ZGold, ZBengkel, ZBilliar, ZPOS, ZGym, Z-Resto, Z-Absen, Z-Rooms) supaya tidak mulai dari kosong. Aman dijalankan berkali-kali — otomatis dilewati kalau sudah ada data.

## Cara kerja fitur Video (penting dibaca sebelum pakai)
Video dipotong dengan mengambil **sampel dari 3 titik waktu** (sepertiga awal, tengah, akhir durasi asli), masing-masing ~20 detik, lalu disambung jadi satu video ~60 detik. Ini **heuristik sederhana**, BUKAN AI yang memahami isi video dan memilih momen paling menarik — kalau butuh itu, ada produk khusus (Opus Clip, Vizard, dsb) yang jauh lebih canggih untuk itu. Tujuannya di sini cuma bikin hasil potongan lebih dinamis dibanding motong 60 detik pertama secara linear.

Caption yang diketik akan ditempel di ATAS video sepanjang durasinya (bukan subtitle yang mengikuti waktu bicara). Kalau video aslinya ≤60 detik, tidak dipotong sama sekali — caption langsung ditempel ke video utuh.

Video besar/panjang butuh waktu proses (bisa puluhan detik sampai beberapa menit tergantung ukuran & kecepatan server) — halaman akan otomatis cek status tiap 3 detik, tidak perlu ditunggu di depan layar.

## Tidak terhubung ke Z One
App ini **berdiri sendiri** — tidak pakai SSO, tidak baca database Z One. Daftar app yang mau dipromosikan dikelola manual lewat halaman "Kelola App", bukan otomatis sinkron dari ekosistem.

## Artikel otomatis harian (cron)
Script `scripts/artikel-harian.ts` generate 1 artikel per hari untuk app berikutnya (rotasi adil: app setelah yang terakhir di-publish, wraparound ke awal), lalu **langsung publish** ke repo `djvpri/zomet-main` (`content/artikel/<slug>-<YYYYMMDD>.md`). App baru di "Kelola App" langsung mendapat giliran berdasarkan urutan id — tanpa ubah kode. Jika hari itu sudah ada artikel published (draft di-tandai `published`), script melompat (idempotent), aman dari overlap cron.

Jalankan manual / test:
```bash
npm run artikel:harian:test   # self-check logika rotasi (tanpa DB, tanpa Gemini)
DRY_RUN=1 npm run artikel:harian   # generate + simpan draft, TANPA push ke GitHub
npm run artikel:harian             # generate + publish penuh
```
Butuh env: `DATABASE_URL`, `GEMINI_API_KEY`, `GITHUB_TOKEN`.

**Setup di Railway (sekali):**
1. Buat **service/paas cron** terpisah (mis. `zadv-cron`) memakai image hasil build yang sama.
2. Atur **command** service tsb: `npm run artikel:harian`.
3. Set **schedule** ke `0 0 * * *` (00:00 UTC = 07:00 WIB).
4. Pastikan semua env (`DATABASE_URL`, `GEMINI_API_KEY`, `GITHUB_TOKEN`) ikut di-set di service cron.
