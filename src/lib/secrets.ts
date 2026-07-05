// Tidak ada fallback hardcode di sini — pelajaran dari seluruh ekosistem
// Zomet: nilai default apa pun di kode akan bocor kalau repo publik, atau
// diam-diam terpakai di produksi kalau env lupa di-set. Kalau env kosong,
// lempar error yang jelas saat dipakai, jangan diam-diam pakai nilai lain.

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} belum di-set di environment.`)
  return v
}

export function getJwtSecret(): string {
  return required('JWT_SECRET')
}

export function getAdminPassword(): string {
  return required('ADMIN_PASSWORD')
}

export function getGeminiKey(): string {
  return required('GEMINI_API_KEY')
}
