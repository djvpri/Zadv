// Pemrosesan video: potong jadi ~60 detik dengan mengambil sampel dari 3
// zona (depan/tengah/belakang) lalu disambung — BUKAN AI yang "memahami"
// isi video (itu problem computer vision yang jauh lebih sulit, ada
// produk khusus untuk itu seperti Opus Clip). Ini heuristik sederhana:
// ambil potongan dari 3 titik waktu berbeda supaya hasilnya lebih dinamis
// dibanding cuma memotong 60 detik pertama secara linear.
//
// Semua langkah di sini sudah diverifikasi manual dengan video sintetis +
// pemeriksaan visual frame-by-frame sebelum dipakai di produksi — termasuk
// menemukan 2 bug ffmpeg yang tidak jelas dari dokumentasi:
// 1. drawtext+textfile MEMATIKAN teks sepenuhnya (tanpa error) kalau ada
//    karakter '%' literal (ditafsirkan sebagai awal ekspansi %{...}).
//    %% (escape ganda yang biasa dipakai utk parameter text= biasa) TIDAK
//    berlaku untuk textfile= — solusinya sanitasi teks sebelum ditulis.
// 2. fontsize bisa pakai ekspresi relatif lebar video (w/18) supaya
//    proporsional di video vertikal (1080x1920) maupun landscape,
//    tanpa perlu tahu resolusi video di kode Node.js.

import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'

const TARGET_TOTAL_DETIK = 60
const JUMLAH_SEGMEN = 3
const FONTSIZE_EXPR = 'w/18'
const MAX_KARAKTER_PER_BARIS = 28

function jalankan(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args)
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} keluar dengan kode ${code}: ${stderr.slice(-800)}`))
    })
  })
}

async function getDurasi(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ])
    let out = ''
    let errOut = ''
    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.stderr.on('data', (d) => { errOut += d.toString() })
    proc.on('error', (e) => reject(new Error(`ffprobe tidak bisa dijalankan: ${e.message}`)))
    proc.on('close', (code) => {
      const detik = parseFloat(out.trim())
      if (code === 0 && !isNaN(detik)) resolve(detik)
      else {
        const detail = errOut.trim().slice(-300) || out.trim() || `exit code ${code}`
        reject(new Error(`Gagal membaca durasi video: ${detail}`))
      }
    })
  })
}

// Ganti '%' literal jadi kata 'persen' — drawtext+textfile mematikan
// seluruh teks tanpa error kalau ada '%' yang tidak diikuti pola
// ekspansi %{...} yang valid, dan escape ganda (%%) tidak menolong disini.
function sanitasiCaption(teks: string): string {
  return teks.replace(/%/g, ' persen').replace(/\s+/g, ' ').trim()
}

// Word-wrap manual jadi multi-baris dengan newline ASLI (bukan '\n' string
// literal) — drawtext+textfile butuh newline sungguhan di file, dan
// karakter '\n' dua-karakter di dalam string filter text= akan muncul
// sebagai huruf 'n' harfiah, bukan baris baru.
function bungkusBaris(teks: string, maxKarakter = MAX_KARAKTER_PER_BARIS): string {
  const kata = teks.split(' ')
  const baris: string[] = []
  let baris_ini = ''
  for (const k of kata) {
    const calon = baris_ini ? `${baris_ini} ${k}` : k
    if (calon.length > maxKarakter && baris_ini) {
      baris.push(baris_ini)
      baris_ini = k
    } else {
      baris_ini = calon
    }
  }
  if (baris_ini) baris.push(baris_ini)
  return baris.join('\n')
}

interface Segmen { mulai: number; panjang: number }

// Bagi durasi jadi N zona sama besar, ambil segmen sepanjang
// (target/N) dari TENGAH tiap zona (bukan pas di pinggir zona, supaya
// tidak kebetulan motong pas di titik transisi zona).
function pilihSegmen(durasi: number, targetTotal: number, jumlahSegmen: number): Segmen[] {
  const panjangSegmen = targetTotal / jumlahSegmen
  const panjangZona = durasi / jumlahSegmen
  // Video lebih pendek dari target -> tidak perlu potong sama sekali,
  // caller akan skip tahap ini kalau durasi <= targetTotal.
  const segPerZona = Math.min(panjangSegmen, panjangZona)
  const segmen: Segmen[] = []
  for (let i = 0; i < jumlahSegmen; i++) {
    const zonaMulai = i * panjangZona
    const mulai = zonaMulai + Math.max(0, (panjangZona - segPerZona) / 2)
    segmen.push({ mulai, panjang: segPerZona })
  }
  return segmen
}

async function ekstrakSegmen(input: string, seg: Segmen, output: string): Promise<void> {
  await jalankan('ffmpeg', [
    '-y', '-ss', String(seg.mulai), '-i', input, '-t', String(seg.panjang),
    '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac',
    '-avoid_negative_ts', 'make_zero', output,
  ])
}

async function gabungSegmen(inputs: string[], output: string, dirSementara: string): Promise<void> {
  const daftarPath = path.join(dirSementara, 'concat_list.txt')
  const isi = inputs.map((p) => `file '${p}'`).join('\n')
  await fs.writeFile(daftarPath, isi, 'utf8')
  await jalankan('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', daftarPath, '-c', 'copy', output])
}

function generateSRT(
  script: string,
  detikPerBaris: number,
  styleUkuran: string,
  stylePosisi: string,
  styleLatar: string,
  styleWarna: string
): string {
  const baris = script.split('\n').map(b => b.trim()).filter(Boolean)
  const entries: string[] = []

  for (let i = 0; i < baris.length; i++) {
    const mulai = i * detikPerBaris
    const akhir = mulai + detikPerBaris

    const toSRTTime = (detik: number) => {
      const h = Math.floor(detik / 3600)
      const m = Math.floor((detik % 3600) / 60)
      const s = Math.floor(detik % 60)
      const ms = Math.round((detik % 1) * 1000)
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`
    }

    entries.push(
      `${i + 1}\n${toSRTTime(mulai)} --> ${toSRTTime(akhir)}\n${baris[i]}\n`
    )
  }

  return entries.join('\n')
}

async function bakarCaption(
  input: string,
  captionMentah: string,
  output: string,
  dirSementara: string,
  styleUkuran = 'sedang',
  stylePosisi = 'bawah',
  styleLatar = 'samar',
  styleWarna = 'putih'
): Promise<void> {
  // Deteksi apakah captionMentah adalah multi-baris script atau caption tunggal
  const baris = captionMentah.split('\n').map(b => b.trim()).filter(Boolean)
  const isMultiBaris = baris.length > 1

  const durasiVideo = await getDurasi(input)
  const DETIK_PER_BARIS = 3

  if (isMultiBaris) {
    // Mode subtitle: tiap baris = satu subtitle ~3 detik
    const srt = generateSRT(captionMentah, DETIK_PER_BARIS, styleUkuran, stylePosisi, styleLatar, styleWarna)
    const srtPath = path.join(dirSementara, 'subtitle.srt')
    await fs.writeFile(srtPath, srt, 'utf8')

    // Ukuran font
    const fontSize = styleUkuran === 'kecil' ? 18 : styleUkuran === 'besar' ? 30 : 24

    // Posisi vertikal (MarginV)
    const marginV = stylePosisi === 'atas' ? 30 : stylePosisi === 'tengah' ? 0 : 30

    // Alignment: atas=8, tengah=5, bawah=2
    const alignment = stylePosisi === 'atas' ? 8 : stylePosisi === 'tengah' ? 5 : 2

    // Warna (ASS format: &HAABBGGRR)
    const primaryColor = styleWarna === 'emas' ? '&H0000D4D8&' : '&H00FFFFFF&'

    // Latar belakang
    const backColor = styleLatar === 'solid' ? '&H99000000&' : styleLatar === 'samar' ? '&H66000000&' : '&H00000000&'
    const borderStyle = styleLatar === 'transparan' ? 1 : 3

    // Force styles via ASS override menggunakan subtitles filter dengan force_style
    const forceStyle = [
      `Fontsize=${fontSize}`,
      `PrimaryColour=${primaryColor}`,
      `BackColour=${backColor}`,
      `BorderStyle=${borderStyle}`,
      `Alignment=${alignment}`,
      `MarginV=${marginV}`,
      `Bold=1`,
      `Shadow=0`,
      `Outline=1`,
      `OutlineColour=&H99000000&`,
    ].join(',')

    await jalankan('ffmpeg', [
      '-y', '-i', input,
      '-vf', `subtitles=${srtPath}:force_style='${forceStyle}'`,
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-c:a', 'copy', output,
    ])
  } else {
    // Mode caption tunggal: teks statis sepanjang video (behavior lama)
    const bersih = captionMentah.replace(/%/g, ' persen').replace(/\s+/g, ' ').trim()
    const captionPath = path.join(dirSementara, 'caption.txt')
    await fs.writeFile(captionPath, bersih, 'utf8')

    const filter = [
      `drawtext=textfile=${captionPath}`,
      `fontcolor=white`,
      `fontsize=${FONTSIZE_EXPR}`,
      `box=1`,
      `boxcolor=black@0.55`,
      `boxborderw=14`,
      `x=(w-text_w)/2`,
      `y=h-th-60`,
      `line_spacing=8`,
    ].join(':')

    await jalankan('ffmpeg', ['-y', '-i', input, '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'copy', output])
  }
}

export interface HasilProses {
  durasiAsli: number
  durasiOutput: number
}

// Orkestrasi penuh: baca durasi -> (potong 3 zona + gabung, kalau video
// lebih panjang dari target) -> bakar caption -> tulis ke outputPath.
// Semua file sementara dibuang di akhir, sukses maupun gagal.
export async function prosesVideo(
  inputPath: string,
  captionMentah: string,
  outputPath: string,
  musicPath?: string | null,
  muteAsli?: boolean,
  fadeOut?: boolean,
  loopMusik?: boolean,
  mulaiDetik?: number,
  styleUkuran = 'sedang',
  stylePosisi = 'bawah',
  styleLatar = 'samar',
  styleWarna = 'putih'
): Promise<HasilProses> {
  const dirSementara = path.join(os.tmpdir(), `zadv-video-${randomUUID()}`)
  await fs.mkdir(dirSementara, { recursive: true })

  try {
    // Re-mux dengan faststart: pindahkan moov atom ke depan file.
    // Diperlukan untuk video dari kamera/HP yang menaruh moov di akhir (lazim di MP4 hasil rekaman).
    // Kalau file terpotong saat upload, langkah ini juga akan gagal dengan pesan jelas.
    const fastStartPath = path.join(dirSementara, 'faststart.mp4')
    try {
      await jalankan('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', fastStartPath])
      inputPath = fastStartPath
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`File video tidak valid atau upload tidak lengkap: ${msg.slice(-400)}`)
    }

    const durasiAsli = await getDurasi(inputPath)
    let sumberUntukCaption = inputPath

    if (durasiAsli > TARGET_TOTAL_DETIK) {
      const segmen = pilihSegmen(durasiAsli, TARGET_TOTAL_DETIK, JUMLAH_SEGMEN)
      const pathSegmen: string[] = []
      for (let i = 0; i < segmen.length; i++) {
        const out = path.join(dirSementara, `seg${i}.mp4`)
        await ekstrakSegmen(inputPath, segmen[i], out)
        pathSegmen.push(out)
      }
      const gabungan = path.join(dirSementara, 'gabungan.mp4')
      await gabungSegmen(pathSegmen, gabungan, dirSementara)
      sumberUntukCaption = gabungan
    }
    // Video sudah <= 60 detik: tidak dipotong sama sekali, caption
    // langsung dibakar ke video asli utuh.

    // Kalau ada musicPath → bakar caption dulu ke file sementara,
    // lalu mix audio musik sebagai backsound di tahap terpisah.
    if (musicPath) {
      // Validasi file musik ada sebelum proses
      const musikAda = await fs.access(musicPath).then(() => true).catch(() => false)
      if (!musikAda) {
        console.warn(`[video] File musik tidak ditemukan: ${musicPath}, lanjut tanpa musik`)
        await bakarCaption(sumberUntukCaption, captionMentah, outputPath, dirSementara, styleUkuran, stylePosisi, styleLatar, styleWarna)
      } else {
        const tempOutput = path.join(dirSementara, 'dengan_caption.mp4')
        await bakarCaption(sumberUntukCaption, captionMentah, tempOutput, dirSementara, styleUkuran, stylePosisi, styleLatar, styleWarna)
        await mixBacksound(tempOutput, musicPath, outputPath, { muteAsli, fadeOut, loopMusik, mulaiDetik })
      }
    } else {
      await bakarCaption(sumberUntukCaption, captionMentah, outputPath, dirSementara, styleUkuran, stylePosisi, styleLatar, styleWarna)
    }

    const durasiOutput = await getDurasi(outputPath)
    return { durasiAsli, durasiOutput }
  } finally {
    await fs.rm(dirSementara, { recursive: true, force: true }).catch(() => {})
  }
}

// Mix backsound musik ke video.
// Strategi: loop musik kalau lebih pendek dari video, ducking 30% volume
// agar audio asli video tetap terdengar, musik jadi latar belakang.
interface OpsiMix {
  muteAsli?: boolean
  fadeOut?: boolean
  loopMusik?: boolean
  mulaiDetik?: number
}

async function mixBacksound(
  videoPath: string,
  musicPath: string,
  outputPath: string,
  opsi: OpsiMix = {}
): Promise<void> {
  const { muteAsli = false, fadeOut = true, loopMusik = true, mulaiDetik = 0 } = opsi

  // Dapatkan durasi video untuk hitung titik fade out
  const durasiVideo = await getDurasi(videoPath)
  const fadeStart = Math.max(0, durasiVideo - 3)

  const args: string[] = []

  // Input video
  args.push('-i', videoPath)

  // Input musik — dengan offset mulai (opsi D)
  if (mulaiDetik > 0) args.push('-ss', String(mulaiDetik))
  if (loopMusik) args.push('-stream_loop', '-1')
  args.push('-i', musicPath)

  if (muteAsli) {
    // Opsi: hanya musik, tidak ada audio asli
    let audioFilter = '[1:a]'

    // Fade out musik (opsi B)
    if (fadeOut) {
      audioFilter = `[1:a]afade=t=out:st=${fadeStart.toFixed(2)}:d=3[aout]`
      args.push('-filter_complex', audioFilter)
      args.push('-map', '0:v', '-map', '[aout]')
    } else {
      args.push('-map', '0:v', '-map', '1:a')
    }
  } else {
    // Mix audio asli + musik
    let filterComplex: string

    if (fadeOut) {
      // Fade out hanya pada track musik, audio asli tetap normal
      filterComplex =
        `[1:a]afade=t=out:st=${fadeStart.toFixed(2)}:d=3[mfade];` +
        `[0:a][mfade]amix=inputs=2:duration=first:weights=1 0.3[aout]`
    } else {
      filterComplex = '[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.3[aout]'
    }

    args.push('-filter_complex', filterComplex)
    args.push('-map', '0:v', '-map', '[aout]')
  }

  args.push('-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', outputPath)

  await jalankan('ffmpeg', args)
}
