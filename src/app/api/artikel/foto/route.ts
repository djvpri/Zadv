import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// GET /api/artikel/foto — list foto
// Query: appId=<n|null>, tag=<s>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const appId = searchParams.get('appId')
  const tag = searchParams.get('tag')

  const where: Record<string, unknown> = {}
  if (appId === 'null') where.appId = null
  else if (appId) where.appId = Number(appId)
  if (tag) where.tags = { has: tag.toLowerCase() }

  const items = await prisma.artikelFoto.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { app: { select: { nama: true, emoji: true } } },
  })

  return NextResponse.json({
    items: items.map(f => ({
      id: f.id,
      appId: f.appId,
      appName: f.app?.nama || null,
      appEmoji: f.app?.emoji || '🌐',
      url: f.url,
      filename: f.filename,
      tags: f.tags,
      useCount: f.useCount,
      lastUsedAt: f.lastUsedAt,
      createdAt: f.createdAt,
    })),
  })
}

// POST /api/artikel/foto — upload satu atau banyak foto (multipart/form-data)
// Fields: files (File[] atau File), tags (string, comma-separated), appId (string, "null" or number)
export async function POST(req: Request) {
  const formData = await req.formData()

  // Support both `files[]` (multi) and `file` (single, backward compat)
  const files = formData.getAll('files').filter(f => f instanceof File) as File[]
  const single = formData.get('file')
  if (single instanceof File) files.push(single)

  if (files.length === 0) {
    return NextResponse.json({ error: 'file wajib' }, { status: 400 })
  }

  const tagsRaw = formData.get('tags') as string | null
  const appIdRaw = formData.get('appId') as string | null

  const tags = tagsRaw
    ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    : []
  const appId = appIdRaw === 'null' || !appIdRaw ? null : Number(appIdRaw)

  const uploadDir = join(process.cwd(), 'public', 'uploads', 'artikel')
  try { mkdirSync(uploadDir, { recursive: true }) } catch {}

  const results: { ok: boolean; filename: string; url?: string; id?: number; error?: string }[] = []
  let ok = 0
  let fail = 0

  for (const file of files) {
    if (file.size > 2 * 1024 * 1024) {
      results.push({ ok: false, filename: file.name, error: 'terlalu besar (max 2MB)' })
      fail++
      continue
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filename = `artikel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    writeFileSync(join(uploadDir, filename), buffer)

    const url = `/api/uploads/artikel/${filename}`
    const foto = await prisma.artikelFoto.create({
      data: { url, filename: file.name, tags, appId },
    })

    results.push({ ok: true, filename: file.name, url, id: foto.id })
    ok++
  }

  return NextResponse.json({ ok, fail, results })
}

// DELETE /api/artikel/foto?id=<n>
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 })

  const foto = await prisma.artikelFoto.delete({ where: { id } })

  if (foto.url.startsWith('/api/uploads/')) {
    const relPath = foto.url.replace('/api/uploads/', '')
    const filePath = join(process.cwd(), 'public', 'uploads', relPath)
    try {
      const { unlinkSync } = await import('fs')
      unlinkSync(filePath)
    } catch {}
  }

  return NextResponse.json({ ok: true })
}
