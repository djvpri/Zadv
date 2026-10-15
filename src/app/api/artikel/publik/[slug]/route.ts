import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/artikel/publik/[slug] — detail artikel by slug
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const artikel = await prisma.artikelDraft.findFirst({
    where: { slug, status: 'published' },
    select: {
      id: true, appId: true, judul: true, slug: true,
      deskripsi: true, tags: true, konten: true,
      publishedAt: true, youtubeUrl: true, gambarPath: true,
    },
  })

  if (!artikel) return NextResponse.json({ error: 'Artikel tidak ditemukan' }, { status: 404 })
  return NextResponse.json(artikel)
}
