import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGithubToken } from '@/lib/secrets'

const OWNER = 'djvpri'
const REPO = 'zomet-main'
const BRANCH = 'main'
const BASE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents`

function buildFileContent(judul: string, deskripsi: string, tags: string[], konten: string, date: string): string {
  const tagYaml = tags.map(t => `  - "${t}"`).join('\n')
  return `---
title: "${judul.replace(/"/g, '\\"')}"
description: "${deskripsi.replace(/"/g, '\\"')}"
date: "${date}"
tags:
${tagYaml}
---

${konten}`
}

export async function POST(req: Request) {
  const { draftId, judul, slug, deskripsi, tags, konten } = await req.json()

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
  const filePath = `content/artikel/${slug}.md`
  const fileUrl = `${BASE_URL}/${filePath}`
  const fileContent = buildFileContent(judul, deskripsi, tags, konten, today)
  const encoded = Buffer.from(fileContent, 'utf-8').toString('base64')

  // Cek apakah file sudah ada (untuk mendapat sha jika update)
  let sha: string | undefined
  const checkRes = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (checkRes.ok) {
    const existing = await checkRes.json()
    sha = existing.sha
  }

  const body: Record<string, string> = {
    message: `feat: artikel - ${judul}`,
    content: encoded,
    branch: BRANCH,
  }
  if (sha) body.sha = sha

  const pushRes = await fetch(fileUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!pushRes.ok) {
    const err = await pushRes.json()
    console.error('GitHub push gagal:', err)
    return NextResponse.json({ error: 'Gagal push ke GitHub: ' + (err.message || pushRes.status) }, { status: 502 })
  }

  // Update status draft jika ada draftId
  if (draftId) {
    await prisma.artikelDraft.update({
      where: { id: Number(draftId) },
      data: {
        judul, slug, deskripsi,
        tags: Array.isArray(tags) ? tags : [],
        konten,
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
