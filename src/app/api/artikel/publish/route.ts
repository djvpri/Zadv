import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGithubToken } from '@/lib/secrets'

const OWNER = 'djvpri'
const REPO = 'zomet-main'
const BRANCH = 'main'
const BASE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents`

function youtubeEmbedId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function buildFileContent(
  judul: string,
  deskripsi: string,
  tags: string[],
  konten: string,
  date: string,
  gambarPath?: string,
  youtubeUrl?: string,
): string {
  const tagYaml = tags.map(t => `  - "${t}"`).join('\n')
  const imageLine = gambarPath ? `\nimage: "${gambarPath}"` : ''
  const youtubeLine = youtubeUrl ? `\nyoutube: "${youtubeUrl}"` : ''

  let body = konten

  // Sisipkan embed YouTube di awal konten jika ada
  if (youtubeUrl) {
    const vid = youtubeEmbedId(youtubeUrl)
    if (vid) {
      const embedBlock = `\n<div class="video-embed">\n  <iframe src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe>\n</div>\n\n`
      body = embedBlock + konten
    }
  }

  return `---
title: "${judul.replace(/"/g, '\\"')}"
description: "${deskripsi.replace(/"/g, '\\"')}"
date: "${date}"${imageLine}${youtubeLine}
tags:
${tagYaml}
---

${body}`
}

async function pushToGitHub(
  token: string,
  filePath: string,
  contentBase64: string,
  commitMessage: string,
) {
  const fileUrl = `${BASE_URL}/${filePath}`
  let sha: string | undefined
  const checkRes = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (checkRes.ok) {
    const existing = await checkRes.json()
    sha = existing.sha
  }
  const body: Record<string, string> = { message: commitMessage, content: contentBase64, branch: BRANCH }
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
    throw new Error('Gagal push ke GitHub: ' + (err.message || pushRes.status))
  }
}

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
