# Zadv — API Contract

Semua endpoint di bawah `/api/`. Auth via cookie `zadv_session` (JWT HS256, 30 hari).

## Auth

### POST /api/auth/login
Login dengan password tunggal.

**Request:**
```json
{ "password": "string" }
```
**Response 200:**
```json
{ "ok": true }
```
**Response 400:** `{ "error": "Password wajib diisi" }`
**Response 401:** `{ "error": "Password salah" }`
**Response 503:** `{ "error": "Login belum dikonfigurasi (ADMIN_PASSWORD)" }`

Set cookie: `zadv_session=<jwt>; Path=/; Max-Age=2592000; HttpOnly; SameSite=lax`

---

### POST /api/auth/logout
Hapus session cookie.

**Response 200:** `{ "ok": true }`

---

## Health

### GET /api/health
Public. Cek service hidup.

**Response 200:**
```json
{ "ok": true, "service": "zadv", "ts": "2026-10-15T00:00:00.000Z" }
```

---

## Apps

### GET /api/apps
List semua app aktif (urut `urutan` asc).

**Auth:** Cookie **ATAU** header `X-Cross-App-Secret: <CROSS_APP_SECRET>` (untuk akses lintas-app, dipakai ZPos cron).

**Response 200:**
```json
[
  { "id": 1, "nama": "ZGold", "emoji": "💎", "tagline": "...", "fitur": [...], "accent": "#D97706", "tint": "#FEF3E2", "url": null, "aktif": true, "urutan": 1 }
]
```

### POST /api/apps
Tambah app baru. **Auth:** Cookie.

**Request:**
```json
{ "nama": "string", "tagline": "string", "emoji": "📦", "fitur": ["..."], "accent": "#2563EB", "tint": "#EBF1FF", "url": "https://...", "urutan": 0 }
```
**Response 201:** Object app lengkap.

### PUT /api/apps/[id]
Update app. **Auth:** Cookie.

**Request:** sama seperti POST (field opsional).
**Response 200:** Object app updated.
**Response 404:** `{ "error": "App tidak ditemukan" }`

### DELETE /api/apps/[id]
Soft delete (set `aktif=false`). **Auth:** Cookie.

**Response 200:** `{ "ok": true }`

---

## Generate

### POST /api/generate/caption
Generate caption promosi via Gemini. **Auth:** Cookie.

**Request:**
```json
{
  "appId": 1,
  "platform": "instagram|whatsapp|facebook",
  "tone": "santai|profesional|urgent",
  "variasiLain": false,
  "format": "caption|video"
}
```

**Response 200 (format=caption):**
```json
{ "id": 123, "teks": "caption text...", "createdAt": "2026-..." }
```

**Response 200 (format=video):**
```json
{ "script": "line1\nline2\n...", "deskripsi": "...", "tags": ["#tag1", "#tag2"] }
```

**Response 400:** `{ "error": "appId, platform, tone wajib diisi" }`
**Response 404:** `{ "error": "App tidak ditemukan" }`
**Response 502:** `{ "error": "Gagal generate, coba lagi." }`

Catatan: jika `app.nama === 'ZOne'`, prompt diarahkan ke program afiliasi/mitra, bukan produk SaaS.

### GET /api/generate/poster?appId=1
Generate poster PNG 1080x1080 via @vercel/og. **Auth:** Cookie.

**Response 200:** `image/png`
**Response 400:** `appId tidak valid`
**Response 404:** `App tidak ditemukan`

### POST /api/generate/artikel
Generate draft artikel SEO via Gemini. **Auth:** Cookie.

**Request:**
```json
{ "appId": 1 }
```

**Response 200:**
```json
{ "id": 123, "judul": "...", "slug": "...", "deskripsi": "...", "tags": ["..."], "konten": "## ...", "date": "2026-10-15" }
```

---

## Artikel

### POST /api/artikel/publish
Publish artikel ke GitHub repo `djvpri/zomet-main`. **Auth:** Cookie.

**Request:**
```json
{
  "draftId": 123,
  "judul": "string",
  "slug": "string",
  "deskripsi": "string",
  "tags": ["string"],
  "konten": "string",
  "youtubeUrl": "https://youtube.com/watch?v=...",
  "gambarBase64": "base64...",
  "gambarExt": ".jpg"
}
```

**Response 200:**
```json
{ "ok": true, "slug": "...", "url": "https://www.zomet.my.id/artikel/..." }
```

**Response 503:** `GITHUB_TOKEN belum di-set`

---

## Video

### POST /api/video/upload
Upload video + proses otomatis. **Auth:** Cookie (dicek manual, middleware skip).

Dua mode upload:
1. **Single:** body = raw binary, metadata via header `X-Video-Metadata` (JSON) atau query params.
2. **Chunked:** header `X-Upload-Id`, `X-Chunk-Index`, `X-Total-Chunks`. Chunk terakhir trigger merge + process.

Metadata fields: `script`, `type` (mime), `filename`, `appId`, `musicTrackId`, `fileSize`, `muteAsli`, `fadeOut`, `noLoop`, `mulaiDetik`, `style_ukuran`, `style_posisi`, `style_latar`, `style_warna`.

**Response 200:**
```json
{ "id": 123, "status": "pending" }
```

**Response 400:** File kosong, terlalu besar (max 200MB), format tidak didukung, script kosong, upload tidak lengkap.

### GET /api/video/[id]/status
Cek status video job. **Auth:** Cookie.

**Response 200:**
```json
{ "id": 123, "status": "pending|processing|done|error", "errorMessage": null, "durasiAsli": 120.5, "siap": false }
```

### GET /api/video/[id]/download
Download hasil video (MP4). **Auth:** Cookie.

**Response 200:** `video/mp4` (attachment)
**Response 404:** Video belum siap / file tidak ditemukan

---

## Music

### GET /api/music
List semua musik track. **Auth:** Cookie (manual).

**Response 200:**
```json
[{ "id": 1, "nama": "...", "durasi": 180.5, "path": "/data/music/uuid.mp3", "ukuran": 5000000, "createdAt": "..." }]
```

### POST /api/music
Upload musik (single atau chunked, sama seperti video). **Auth:** Cookie (manual).

Query params: `nama`, `type` (mime), `filename`.

**Response 200:** Object track.

### DELETE /api/music/[id]
Hapus musik. **Auth:** Cookie.

**Response 200:** `{ "ok": true }`

---

## Riwayat

### GET /api/riwayat
100 konten promo terakhir (caption + poster + video_script). **Auth:** Cookie.

**Response 200:**
```json
[{ "id": 1, "appId": 1, "tipe": "caption", "platform": "instagram", "tone": "santai", "teks": "...", "createdAt": "...", "app": { "nama": "...", "emoji": "...", "accent": "..." } }]
```

---

## WA Massal

### GET /api/wa-massal
Cek apakah `FONNTE_TOKEN` ter-set. **Auth:** Cookie.

**Response 200:** `{ "hasEnvToken": true }`

### POST /api/wa-massal
Kirim WA ke satu nomor via Fonnte. **Auth:** Cookie.

**Request:**
```json
{
  "token": "string (opsional, fallback ke FONNTE_TOKEN env)",
  "target": "628123456789",
  "message": "string",
  "url": "https://... (media URL, opsional)",
  "filename": "string (opsional)",
  "cooldownHari": 7
}
```

**Response 200:**
- `{ "ok": true }` — terkirim
- `{ "ok": false, "skip": true, "reason": "Nomor di blacklist" }` — skip blacklist
- `{ "ok": false, "skip": true, "reason": "Dikirimi 3 hari lalu" }` — skip cooldown
- `{ "ok": false, "reason": "..." }` — gagal kirim

### GET /api/wa-massal/kontak
List semua kontak. **Auth:** Cookie.

### POST /api/wa-massal/kontak
Tambah kontak. **Auth:** Cookie.

**Request:** `{ "nama": "string", "nomor": ["628..."] | "628...", "grup": "string" }`
Cek duplikat nomor → 409.

### PUT /api/wa-massal/kontak/[id]
Edit kontak.

### DELETE /api/wa-massal/kontak/[id]
Hapus kontak.

### PATCH /api/wa-massal/kontak/bulk
Bulk assign grup. **Request:** `{ "ids": [1,2,3], "grup": "string|null" }`

### DELETE /api/wa-massal/kontak/bulk
Bulk hapus. **Request:** `{ "ids": [1,2,3] }`

### GET /api/wa-massal/grup
List grup kontak.

### POST /api/wa-massal/grup
Tambah grup. **Request:** `{ "nama": "string", "nomor": ["628..."] }`

### DELETE /api/wa-massal/grup/[id]
Hapus grup.

### GET /api/wa-massal/template
List template pesan.

### POST /api/wa-massal/template
Tambah template. **Request:** `{ "judul", "teks", "mediaUrl", "mediaFilename", "mediaMime" }`

### DELETE /api/wa-massal/template/[id]
Hapus template.

### GET /api/wa-massal/blacklist
List blacklist nomor.

### POST /api/wa-massal/blacklist
Tambah/upsert nomor ke blacklist. **Request:** `{ "nomor": "628...", "alasan": "..." }`

### DELETE /api/wa-massal/blacklist
Hapus dari blacklist. **Request:** `{ "nomor": "628..." }`

### GET /api/wa-massal/riwayat
Riwayat WA: count bulanan + 100 terakhir.

**Response 200:**
```json
{ "bulanan": 42, "data": [{ "id": 1, "nomor": "...", "pesan": "...", "status": "terkirim|gagal", "alasan": null, "sentAt": "..." }] }
```

### POST /api/wa-massal/media
Upload media ke disk. **Auth:** Cookie.

Header: `X-Media-Type` (mime), `X-File-Name`.
Body: raw binary. Max 16MB.

**Response 201:** `{ "url": "https://.../api/wa-massal/media/uuid.jpg", "filename": "uuid.jpg", ... }`

### DELETE /api/wa-massal/media
Hapus media. **Request:** `{ "filename": "uuid.jpg" }`

### GET /api/wa-massal/media/[filename]
Sajikan media file. Path traversal dicegah (`/` dan `..` ditolak).

### POST /api/wa-massal/media/fonnte-upload
Upload media ke catbox.moe (gratis, no API key). **Auth:** Cookie.

Header: `X-Media-Type`, `X-File-Name`. Body: raw binary. Max 16MB.
**Response 201:** `{ "url": "https://files.catbox.moe/xxx.jpg", ... }`

### GET /api/wa-massal/gmaps?q=query
Scrape nomor WA dari Google Places API. **Auth:** Cookie. Butuh `GOOGLE_PLACES_API_KEY`.

**Response 200:**
```json
{ "places": [{ "id": "...", "nama": "...", "nomor": "628...", "nomorRaw": "+62 8...", "alamat": "..." }] }
```

### GET /api/wa-massal/tiktok?u=username
Scrape nomor WA dari bio TikTok. **Auth:** Cookie.

**Response 200:**
```json
{ "nama": "...", "bio": "...", "nomors": ["628..."], "followers": 12345 }
```

### POST /api/wa-massal/tiktok
Parse nomor dari teks yang di-paste. **Auth:** Cookie.

**Request:** `{ "teks": "string" }`
**Response 200:** `{ "nomors": ["628..."] }`
