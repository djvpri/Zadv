# Zadv — Development Guide for AI Agents

> **Meja Promosi** — internal tool untuk generate caption, poster, video, artikel, dan WA massal
> untuk ekosistem Zomet. Next.js 15 + Prisma + PostgreSQL + Electron desktop.

## Quick Reference

| What | Where |
|------|-------|
| Entry point (web) | `src/app/page.tsx` → redirect `/app` |
| Entry point (desktop) | `electron/main.js` |
| API routes | `src/app/api/**/route.ts` |
| Pages | `src/app/app/**/page.tsx` |
| Lib | `src/lib/*.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Auth | `src/lib/auth.ts` + `src/middleware.ts` |
| Secrets | `src/lib/secrets.ts` |
| Video processing | `src/lib/video-processing.ts` (ffmpeg) |
| Artikel helper | `src/lib/artikel.ts` (shared API + cron) |
| Scripts | `scripts/*.js` / `scripts/*.ts` |
| Dockerfile | `Dockerfile` (node:20-slim + ffmpeg) |
| Deploy | Coolify VPS `103.93.129.94` |

## Commands

```bash
npm install
cp .env.example .env          # isi semua env var
npx prisma db push             # sync schema ke DB
npm run seed                   # isi 8 app awal (idempotent)
npm run dev                    # dev server localhost:3000
npm run build                  # production build (standalone)
npm run start                  # start production (migrate.js → next start)
npm run lint                   # eslint
npm run elektron:dev           # electron dev mode
npm run elektron:build         # build portable .exe
npm run artikel:harian         # cron generate artikel harian
npm run artikel:harian:test    # self-check logika rotasi (no DB/Gemini)
DRY_RUN=1 npm run artikel:harian  # generate draft tanpa push GitHub
```

## Environment Variables

| Var | Wajib | Keterangan |
|-----|-------|------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret untuk JWT signing (jose HS256) |
| `ADMIN_PASSWORD` | ✅ | Password login tunggal (bukan SSO) |
| `GEMINI_API_KEY` | ✅ | Google AI Studio API key (gemini-2.5-flash) |
| `CROSS_APP_SECRET` | ✅ | Secret untuk akses lintas-app (GET /api/apps via header) |
| `FONNTE_TOKEN` | WA | Token API Fonnte untuk WA Massal |
| `VIDEO_STORAGE_DIR` | WA | Path volume video (default: `.tmp-videos`) |
| `ELECTRON_APP` | WA | Set `true` untuk HTTP deploy (cookie Secure=false) |
| `GITHUB_TOKEN` | Cron | PAT untuk push artikel ke `djvpri/zomet-main` |
| `GOOGLE_PLACES_API_KEY` | Opsional | Untuk fitur scrape nomor dari Google Maps |
| `WA_MEDIA_DIR` | Opsional | Path storage media WA (default: `/data/wa-media`) |

### Catatan penting env vars

- **`ELECTRON_APP=true`** wajib di-set untuk deploy HTTP (bukan HTTPS).
  Cookie `zadv_session` punya flag `Secure` yang di-conditional:
  `secure = !isElectron && NODE_ENV === 'production'`.
  Tanpa env ini di HTTP deploy → login sukses tapi cookie ditolak browser → redirect balik `/login`.

- **`DATABASE_URL`** di Coolify: gunakan container name Postgres internal,
  bukan Railway proxy (Prisma engine TLS handshake gagal via Railway TCP proxy).
  Format: `postgresql://postgres:<pass>@<container-id>:5432/postgres`

- **Tidak ada fallback hardcode** untuk secrets. `secrets.ts` lempar error
  kalau env kosong. Jangan tambahkan default.

## Architecture

### Auth Flow

```
POST /api/auth/login { password: "..." }
  → cek ADMIN_PASSWORD env
  → sign JWT (jose HS256, 30 hari)
  → set cookie zadv_session (httpOnly, sameSite=lax)
  → { ok: true }

Middleware (src/middleware.ts):
  - /api/auth/*    → public
  - /api/health    → public
  - /login         → public
  - GET /api/apps  → public dengan header X-Cross-App-Secret
  - /api/music/*   → skip middleware (upload besar), auth dicek manual di route
  - /api/video/*   → skip middleware (upload besar), auth dicek manual di route
  - /api/* lain    → wajib cookie valid
  - /app/*         → wajib cookie valid, else redirect /login
```

### Database Models (prisma/schema.prisma)

```
PromoApp      — app yang dipromosikan (ZGold, ZBengkel, dll)
KontenPromo   — riwayat caption/poster/video_script per app
VideoJob      — job video processing (pending → processing → done/error)
MusicTrack    — file musik untuk backsound video
ArtikelDraft  — draft artikel SEO (draft → published)
WaGrupKontak  — grup kontak WA (nama + array nomor)
WaKontak      — kontak WA (nama + array nomor + grup)
WaTemplate    — template pesan WA (+ media URL)
WaRiwayat     — log pengiriman WA (terkirim/gagal)
WaBlacklist   — nomor yang diblokir
```

### API Routes Summary

Lihat `API_CONTRACT.md` untuk detail tiap endpoint.

| Route | Method | Auth | Fungsi |
|-------|--------|------|--------|
| `/api/health` | GET | public | Health check |
| `/api/auth/login` | POST | public | Login, set cookie |
| `/api/auth/logout` | POST | cookie | Hapus cookie |
| `/api/apps` | GET | cross-app-secret / cookie | List app aktif |
| `/api/apps` | POST | cookie | Tambah app |
| `/api/apps/[id]` | PUT/DELETE | cookie | Edit / soft-delete app |
| `/api/generate/caption` | POST | cookie | Generate caption via Gemini |
| `/api/generate/poster` | GET | cookie | Generate poster PNG (@vercel/og) |
| `/api/generate/artikel` | POST | cookie | Generate draft artikel SEO |
| `/api/artikel/publish` | POST | cookie | Publish artikel ke GitHub |
| `/api/video/upload` | POST | cookie (manual) | Upload + process video |
| `/api/video/[id]/status` | GET | cookie | Cek status video job |
| `/api/video/[id]/download` | GET | cookie | Download hasil video |
| `/api/music` | GET/POST | cookie (manual) | List / upload musik |
| `/api/music/[id]` | DELETE | cookie | Hapus musik |
| `/api/riwayat` | GET | cookie | Riwayat konten (100 terakhir) |
| `/api/wa-massal` | GET/POST | cookie | Cek token / kirim WA |
| `/api/wa-massal/kontak` | GET/POST | cookie | CRUD kontak |
| `/api/wa-massal/kontak/[id]` | PUT/DELETE | cookie | Edit/hapus kontak |
| `/api/wa-massal/kontak/bulk` | PATCH/DELETE | cookie | Bulk grup/hapus |
| `/api/wa-massal/grup` | GET/POST | cookie | CRUD grup |
| `/api/wa-massal/grup/[id]` | DELETE | cookie | Hapus grup |
| `/api/wa-massal/template` | GET/POST | cookie | CRUD template |
| `/api/wa-massal/template/[id]` | DELETE | cookie | Hapus template |
| `/api/wa-massal/blacklist` | GET/POST/DELETE | cookie | CRUD blacklist |
| `/api/wa-massal/riwayat` | GET | cookie | Riwayat WA (bulanan + 100 terakhir) |
| `/api/wa-massal/media` | POST/DELETE | cookie | Upload/hapus media |
| `/api/wa-massal/media/[filename]` | GET | public* | Sajikan media |
| `/api/wa-massal/media/fonnte-upload` | POST | cookie | Upload ke catbox.moe |
| `/api/wa-massal/gmaps` | GET | cookie | Scrape nomor dari Google Places |
| `/api/wa-massal/tiktok` | GET/POST | cookie | Scrape nomor dari TikTok bio |

### Pages

| Path | File | LOC | Fungsi |
|------|------|-----|--------|
| `/login` | `src/app/login/page.tsx` | 64 | Form password |
| `/app` | `src/app/app/page.tsx` | 295 | Dashboard: pilih app, generate caption/poster |
| `/app/video` | `src/app/app/video/page.tsx` | 480 | Upload video, proses, download |
| `/app/artikel` | `src/app/app/artikel/page.tsx` | 418 | Generate & publish artikel SEO |
| `/app/musik` | `src/app/app/musik/page.tsx` | 270 | Upload & kelola musik |
| `/app/wa-massal` | `src/app/app/wa-massal/page.tsx` | 1722 | WA massal: kontak, grup, template, kirim, blacklist, gmaps, tiktok |
| `/app/riwayat` | `src/app/app/riwayat/page.tsx` | 73 | Riwayat caption/poster |
| `/app/kelola` | `src/app/app/kelola/page.tsx` | 166 | CRUD app |

### Scripts

| Script | Fungsi |
|--------|--------|
| `scripts/migrate.js` | `prisma db push` sebelum `next start` (auto di Coolify start) |
| `scripts/seed-apps.js` | Seed 8 app awal (idempotent) |
| `scripts/artikel-harian.ts` | Cron harian: generate artikel + publish ke GitHub |
| `scripts/artikel-harian.test.ts` | Self-check rotasi (assert, no framework) |
| `scripts/update-zone.js` | Insert/update data app ZOne |
| `scripts/build-electron.js` | Build Next.js standalone → electron-builder portable |

### Video Processing Pipeline

```
Upload → save to disk → create VideoJob (pending)
  → background process:
    1. faststart (remux moov atom)
    2. get duration via ffprobe
    3. if >60s: pick 3 segments (front/mid/back, ~20s each) → concat
    4. burn caption:
       - multi-line script → SRT subtitles (3s per line)
       - single line → static drawtext
    5. if music: mix backsound (ducking 30%, optional fade out, loop)
  → update VideoJob (done/error) → download via /api/video/[id]/download
```

Bug ffmpeg yang sudah diketahui (lihat komentar di `video-processing.ts`):
- `drawtext+textfile` mematikan teks jika ada `%` literal → sanitasi: ganti `%` → ` persen`
- `fontsize` pakai ekspresi `w/18` supaya proporsional di portrait & landscape

## Conventions

- **Bahasa Indonesia** untuk semua teks UI, prompt AI, komentar, pesan error
- **No fallback hardcode** untuk secrets — throw jika env kosong
- **Soft delete** untuk app (set `aktif=false`), bukan hard delete
- **Idempotent** seed script (skip jika sudah ada data)
- **Idempotent** artikel cron (skip jika hari ini sudah published)
- **Fire and forget** untuk riwayat WA (`.catch(() => {})`)
- **Chunked upload** didukung untuk video (header `X-Upload-Id`, `X-Chunk-Index`, `X-Total-Chunks`)
- **Cookie**: `zadv_session`, 30 hari, httpOnly, sameSite=lax
- **Cross-app access**: header `X-Cross-App-Secret` untuk GET `/api/apps` (dipakai ZPos cron artikel)
- **Gemini model**: `gemini-2.5-flash`
- **GitHub push**: artikel dipublish ke `djvpri/zomet-main` repo, path `content/artikel/<slug>.md`
- **SRT subtitles**: caption multi-baris → tiap baris = subtitle ~3 detik

## Deploy (Coolify)

1. App UUID: `af7witcncxxt5fvjn0yg2bdz`
2. Build pack: `dockerfile` (Dockerfile di root repo)
3. Postgres: Coolify managed, container `17nxegyeiy0lzildqhd1zpst`
4. Domain: `http://af7witcncxxt5fvjn0yg2bdz.103.93.129.94.sslip.io`
5. Env vars: 8 vars (lihat tabel di atas) di-set via Coolify DB atau UI
6. Start command: `npm start` (menjalankan `scripts/migrate.js` → `next start`)
7. `ELECTRON_APP=true` wajib untuk HTTP deploy (cookie fix)

### Troubleshooting Coolify

- **Login gagal tapi API return `{"ok":true}`**: cek `ELECTRON_APP=true` di env.
  Cookie `Secure=true` ditolak browser di HTTP.
- **Prisma connection error**: gunakan container name Postgres Coolify
  (`17nxegyeiy0lzildqhd1zpst:5432`), bukan Railway proxy.
- **Coolify UI "payload is invalid"**: env vars di Coolify DB harus encrypted
  (Laravel Encrypter). Insert via `php artisan tinker` dengan `encrypt()`.
- **Deploy fail di start step**: container start manual via
  `docker compose -f <compose> --env-file <env> up -d` di VPS.

## Known Issues

- `railway.toml` adalah legacy config (app sudah migrasi ke Coolify)
- `wa-massal/page.tsx` 1722 baris — kandidat refactor split jadi komponen
- `getPublicUrl()` di `media/route.ts` pakai `NEXTAUTH_URL` (misnomer, bukan auth)
- `artikel/publish/route.ts` line 61: `catch (e: any)` — sebaiknya `unknown`
- Google Places & TikTok scrape bisa gagal jika API key kosong / TikTok blokir
