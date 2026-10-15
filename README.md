# Meja Promosi (Zadv)

Internal tool untuk generate caption, poster, video, artikel SEO, dan kirim WA massal
untuk ekosistem Zomet. Login pakai password tunggal — bukan SSO Z One.

## Fitur

- **Meja Cetak** — pilih app, atur platform & tone, generate caption via Gemini. Poster unduh PNG.
- **Video** — upload video, otomatis dipotong ~60 detik (sampel 3 zona: depan/tengah/belakang), caption dibakar sebagai subtitle atau teks statis. Backsound musik opsional.
- **Artikel** — generate draft artikel SEO via Gemini, publish langsung ke repo `djvpri/zomet-main`.
- **Musik** — upload musik untuk backsound video (ekstrak audio dari video juga didukung).
- **WA Massal** — kirim WA ke kontak/grup via Fonnte. Fitur: kontak CRUD, template, blacklist, cooldown, media upload, scrape nomor dari Google Maps & TikTok.
- **Riwayat** — semua caption/poster yang pernah dibuat.
- **Kelola App** — tambah/edit/hapus app yang dipromosikan (soft delete).

## Setup Lokal

```bash
npm install
cp .env.example .env          # isi semua env var (lihat tabel di bawah)
npx prisma db push             # sync schema ke DB
npm run seed                   # isi 8 app awal (idempotent)
npm run dev                    # dev server di localhost:3000
```

Fitur Video butuh `ffmpeg` & `ffprobe`:
- Linux: `apt install ffmpeg`
- macOS: `brew install ffmpeg`
- Windows: download dari ffmpeg.org, tambahkan ke PATH
- Docker: sudah otomatis terinstall di Dockerfile

## Environment Variables

| Var | Wajib | Keterangan |
|-----|-------|------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Random string panjang (`openssl rand -hex 32`) |
| `ADMIN_PASSWORD` | ✅ | Password login |
| `GEMINI_API_KEY` | ✅ | API key dari aistudio.google.com |
| `CROSS_APP_SECRET` | ✅ | Secret untuk akses lintas-app (GET /api/apps) |
| `FONNTE_TOKEN` | WA Massal | Token API Fonnte |
| `VIDEO_STORAGE_DIR` | Video | Path volume storage video (default: `.tmp-videos`) |
| `ELECTRON_APP` | HTTP deploy | Set `true` untuk deploy HTTP (cookie fix, lihat bawah) |
| `GITHUB_TOKEN` | Cron artikel | PAT scope `repo` untuk push ke `djvpri/zomet-main` |
| `GOOGLE_PLACES_API_KEY` | Opsional | Scrape nomor dari Google Maps |
| `WA_MEDIA_DIR` | Opsional | Path storage media WA (default: `/data/wa-media`) |

### ⚠️ ELECTRON_APP=true untuk HTTP deploy

Jika deploy via HTTP (bukan HTTPS, mis. Coolify tanpa SSL), **wajib** set `ELECTRON_APP=true`.
Tanpa ini, cookie `Secure` flag aktif → browser menolak cookie → login gagal (API return `{"ok":true}` tapi halaman redirect balik ke `/login`).

## Deploy (Coolify VPS)

App dideploy di Coolify VPS `103.93.129.94`.

1. **Dockerfile** di root repo — `node:20-slim` + ffmpeg. Build pack: `dockerfile`.
2. **Postgres** — gunakan Coolify managed Postgres (container internal), **bukan** Railway proxy. Prisma engine TLS handshake gagal via Railway TCP proxy.
   - Connection: `postgresql://postgres:<pass>@<container-id>:5432/postgres`
3. **Env vars** — 8 vars di-set via Coolify UI atau DB (lihat `AGENTS.md` untuk detail troubleshooting).
4. **Start command** — `npm start` (menjalankan `scripts/migrate.js` → `next start`). Migrate auto-sync schema tiap deploy.
5. **Seed** — jalankan sekali setelah deploy pertama:
   ```bash
   docker exec <container> node scripts/seed-apps.js
   ```
6. **Domain** — `http://<app-uuid>.103.93.129.94.sslip.io` (HTTP, bukan HTTPS).

### Troubleshooting Coolify

| Masalah | Solusi |
|---------|--------|
| Login gagal, API OK | Set `ELECTRON_APP=true` di env vars |
| Prisma connection error | Gunakan container name Postgres internal Coolify |
| Coolify UI "payload is invalid" | Env vars di DB harus encrypted via Laravel `encrypt()` |
| Deploy fail di start step | Start container manual: `docker compose -f <compose> --env-file <env> up -d` |

Lihat `AGENTS.md` untuk detail lengkap troubleshooting.

## Health Check

```bash
./scripts/health-check.sh [BASE_URL]
# Default: http://localhost:3000
# Cek: /api/health, login, /api/apps, cross-app secret
```

## Artikel Otomatis Harian (Cron)

Script `scripts/artikel-harian.ts` generate 1 artikel per hari untuk app berikutnya
(rotasi adil), lalu publish ke `djvpri/zomet-main` (`content/artikel/<slug>-<YYYYMMDD>.md`).

```bash
npm run artikel:harian:test      # self-check rotasi (no DB/Gemini)
DRY_RUN=1 npm run artikel:harian # generate draft, tanpa push GitHub
npm run artikel:harian           # generate + publish penuh
```

Env wajib untuk cron: `DATABASE_URL`, `GEMINI_API_KEY`, `GITHUB_TOKEN`.

### GitHub Actions (alternatif cron)

Workflow `.github/workflows/artikel-harian.yml` jalan tiap 07:00 WIB.

Set repo secrets di GitHub → Settings → Secrets and variables → Actions:
- `DATABASE_URL` (Postgres)
- `GEMINI_API_KEY`
- `ZOMET_PUSH_TOKEN` (PAT scope `repo` untuk push ke `djvpri/zomet-main`)

## Video Processing

Video dipotong dengan mengambil **sampel dari 3 titik waktu** (sepertiga awal, tengah, akhir),
masing-masing ~20 detik, lalu disambung jadi ~60 detik. Ini **heuristik sederhana**, BUKAN AI.

Caption multi-baris → SRT subtitle (3 detik per baris). Caption tunggal → teks statis di bawah.

Video ≤60 detik tidak dipotong. Backsound musik: ducking 30%, optional fade out, loop.

Lihat `src/lib/video-processing.ts` untuk detail (termasuk bug ffmpeg yang diketahui).

## Tidak Terhubung ke Z One

App ini **berdiri sendiri** — tidak pakai SSO, tidak baca database Z One. Daftar app dikelola
manual di halaman "Kelola App". Akses lintas-app hanya via header `X-Cross-App-Secret` untuk
GET `/api/apps` (dipakai ZPos cron artikel).

## Dokumentasi Tambahan

- [`AGENTS.md`](AGENTS.md) — development guide untuk AI agent (struktur, conventions, commands)
- [`API_CONTRACT.md`](API_CONTRACT.md) — semua endpoint, request/response, auth flow
