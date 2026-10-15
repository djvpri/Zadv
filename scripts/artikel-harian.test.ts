// Self-check (tanpa framework): verifikasi logic pure artikel helper.
// Jalankan: npx tsx scripts/artikel-harian.test.ts
import assert from 'node:assert'
import { parseGeminiJson, todayWib } from '../src/lib/artikel'

function cek(nama: string, fn: () => void) {
  fn()
  console.log('OK ', nama)
}

// todayWib: format YYYYMMDD, 8 digit
cek('todayWib returns 8-digit YYYYMMDD', () => {
  const d = todayWib()
  assert.ok(/^\d{8}$/.test(d), `Expected 8 digits, got: ${d}`)
})

// parseGeminiJson: valid JSON
cek('parseGeminiJson parses valid JSON', () => {
  const input = JSON.stringify({ judul: 'Test', slug: 'test', deskripsi: 'Desc', tags: ['a', 'b'], konten: 'Isi' })
  const r = parseGeminiJson(input)
  assert.equal(r.judul, 'Test')
  assert.equal(r.slug, 'test')
  assert.deepEqual(r.tags, ['a', 'b'])
})

// parseGeminiJson: strip markdown code block wrapper
cek('parseGeminiJson strips ```json wrapper', () => {
  const input = '```json\n' + JSON.stringify({ judul: 'T', slug: 's', deskripsi: 'd', tags: [], konten: 'k' }) + '\n```'
  const r = parseGeminiJson(input)
  assert.equal(r.judul, 'T')
})

// parseGeminiJson: newline antar key valid — strip aman, parse sukses
cek('parseGeminiJson handles newlines between keys', () => {
  const raw = '{\n  "judul": "Test",\n  "slug": "test",\n  "deskripsi": "desc",\n  "tags": ["a"],\n  "konten": "isi"\n}'
  const r = parseGeminiJson(raw)
  assert.equal(r.judul, 'Test')
})

// parseGeminiJson: literal control char di dalam string value — strip fix parse
cek('parseGeminiJson strips control chars inside string values', () => {
  const bad = '{"judul":"Line1\x0aLine2","slug":"s","deskripsi":"d","tags":[],"konten":"k"}'
  const r = parseGeminiJson(bad)
  assert.equal(r.judul, 'Line1Line2')
})

// parseGeminiJson: throw kalau field wajib hilang
cek('parseGeminiJson throws on missing fields', () => {
  const input = JSON.stringify({ judul: 'Test', slug: 'test' })
  assert.throws(() => parseGeminiJson(input), /tidak lengkap/)
})

// parseGeminiJson: throw kalau kosong
cek('parseGeminiJson throws on empty response', () => {
  assert.throws(() => parseGeminiJson(''), /kosong|singkat/)
})

console.log('SEMUA PASS.')
