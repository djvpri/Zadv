import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGithubToken } from '@/lib/secrets'
import { buildFileContent, pushToGitHub } from '@/lib/artikel'

export async function POST(req: Request) {
  const {
    draftId, judul, slug, deskripsi, tags, konten,
    youtubeUrl, gambarBase64, gambarExt,
  } = await req.json()

  if (!slug || !judul || !konten) {
    return NextResponse.json({ error: 'Data artikel tidak lengkap' }, { status: 400 })
  }

  let token: string
  try {
    token = getGithubToken()
  } catch {
    return NextResponse.json({ error: 'GITHUB_TOKEN belum di-set di Railway environment variables.' }, { status: 503 })
  }

  try {
    const today = new Date().toISOString().slice(0, 10)
    let gambarPath: string | undefined

    // Push gambar ke GitHub jika ada
    if (gambarBase64 && gambarExt) {
      const ext = gambarExt.replace(/^\./, '')
      const imgFilePath = `public/artikel-gambar/${slug}.${ext}`
      await pushToGitHub(token, imgFilePath, gambarBase64, `asset: gambar artikel - ${slug}`)
      gambarPath = `/artikel-gambar/${slug}.${ext}`
    }

    // Push file markdown artikel
    const fileContent = buildFileContent(judul, deskripsi, tags, konten, today, gambarPath, youtubeUrl || undefined)
    const encoded = Buffer.from(fileContent, 'utf-8').toString('base64')
    await pushToGitHub(token, `content/artikel/${slug}.md`, encoded, `feat: artikel - ${judul}`)

    // Update DB
    if (draftId) {
      await prisma.artikelDraft.update({
        where: { id: Number(draftId) },
        data: {
          judul, slug, deskripsi,
          tags: Array.isArray(tags) ? tags : [],
          konten,
          youtubeUrl: youtubeUrl || null,
          gambarPath: gambarPath || null,
          status: 'published',
          publishedAt: new Date(),
        },
      }).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      slug,
      url: `https://www.zomet.my.id/artikel/${slug}`,
    })
  } catch (e: any) {
    console.error('Publish artikel error:', e)
    return NextResponse.json({ error: e.message || 'Terjadi kesalahan saat publish' }, { status: 500 })
  }
}
