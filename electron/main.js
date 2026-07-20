'use strict'
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const net = require('net')
const crypto = require('crypto')
const { execSync } = require('child_process')

const PORT = 3456
const CONFIG_FILE = path.join(app.getPath('userData'), 'zadv-config.json')

let nextChild = null
let mainWindow = null
let setupWindow = null

// ──────────────────────────── Config ────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {}
  return null
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
}

// ──────────────────────────── Server ────────────────────────────

function getServerPath() {
  return app.isPackaged
    ? path.join(app.getAppPath(), '.next', 'standalone', 'server.js')
    : path.join(__dirname, '..', '.next', 'standalone', 'server.js')
}

function waitForServer(port, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    function check() {
      const req = http.get(`http://127.0.0.1:${port}`, () => {
        req.destroy()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() > deadline) return reject(new Error('Server tidak merespons dalam 45 detik.'))
        setTimeout(check, 600)
      })
      req.setTimeout(1000, () => req.destroy())
    }
    check()
  })
}

function killPortIfBusy(port) {
  try {
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe','pipe','ignore'] })
    const lines = result.split('\n').filter(l => l.includes(`0.0.0.0:${port}`) || l.includes(`127.0.0.1:${port}`))
    for (const line of lines) {
      const pid = line.trim().split(/\s+/).pop()
      if (pid && /^\d+$/.test(pid) && pid !== '0') {
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }) } catch {}
      }
    }
  } catch {}
}

function startNextServer(config) {
  killPortIfBusy(PORT)
  const serverPath = getServerPath()
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Server tidak ditemukan di:\n${serverPath}\n\nJalankan "npm run build:electron" terlebih dahulu.`)
  }

  const videoDir = config.videoStorageDir || path.join(app.getPath('userData'), 'videos')
  fs.mkdirSync(videoDir, { recursive: true })

  const jwtSecret = config.jwtSecret || crypto.randomBytes(32).toString('hex')
  if (!config.jwtSecret) {
    config.jwtSecret = jwtSecret
    saveConfig(config)
  }

  // Pastikan koneksi Railway eksternal selalu pakai SSL
  let dbUrl = config.databaseUrl || ''
  if (dbUrl && !dbUrl.includes('sslmode=') && (dbUrl.includes('rlwy.net') || dbUrl.includes('railway.app') || dbUrl.includes('railway.internal'))) {
    dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'sslmode=require'
  }
  if (dbUrl.includes('railway.internal')) {
    throw new Error(
      'DATABASE_URL menggunakan hostname internal Railway (railway.internal).\n\n' +
      'Gunakan DATABASE_PUBLIC_URL dari Railway Postgres Variables —\n' +
      'hostname-nya berakhiran .rlwy.net atau .railway.app'
    )
  }

  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    GEMINI_API_KEY: config.geminiApiKey,
    JWT_SECRET: jwtSecret,
    ADMIN_PASSWORD: config.adminPassword,
    GITHUB_TOKEN: config.githubToken || '',
    VIDEO_STORAGE_DIR: videoDir,
    PORT: String(PORT),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    ELECTRON_APP: 'true',
  }

  // utilityProcess menggunakan Node.js bawaan Electron — tidak perlu bundel node.exe terpisah
  nextChild = require('electron').utilityProcess.fork(serverPath, [], { env, stdio: 'pipe' })
  nextChild.stdout?.on('data', d => process.stdout.write('[next] ' + d))
  nextChild.stderr?.on('data', d => process.stderr.write('[next] ' + d))

  return waitForServer(PORT)
}

// ──────────────────────────── Windows ────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'Zadv',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // Buka link eksternal di browser default, bukan di Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 560,
    height: 660,
    resizable: false,
    center: true,
    title: 'Zadv — Setup Koneksi',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  setupWindow.loadFile(path.join(__dirname, 'setup.html'))
  setupWindow.on('closed', () => { setupWindow = null })
  return setupWindow
}

// ──────────────────────────── Menu ────────────────────────────

function buildMenu() {
  const template = [
    {
      label: 'Zadv',
      submenu: [
        {
          label: 'Pengaturan Koneksi...',
          click: () => {
            if (setupWindow) return setupWindow.focus()
            createSetupWindow()
          },
        },
        { type: 'separator' },
        {
          label: 'Buka Folder Video Lokal',
          click: () => {
            const config = loadConfig()
            const videoDir = config?.videoStorageDir || path.join(app.getPath('userData'), 'videos')
            shell.openPath(videoDir)
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Keluar' },
      ],
    },
    {
      label: 'Tampilan',
      submenu: [
        { role: 'reload', label: 'Muat Ulang' },
        { role: 'toggleDevTools', label: 'DevTools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Ukuran Asli' },
        { role: 'zoomIn', label: 'Perbesar' },
        { role: 'zoomOut', label: 'Perkecil' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Layar Penuh' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ──────────────────────────── IPC ────────────────────────────

ipcMain.on('save-config', async (event, data) => {
  try {
    saveConfig(data)

    // Kirim status "starting" ke setup window
    event.sender.send('server-status', { type: 'starting', message: 'Menghubungkan ke database & memulai server...' })

    // Matikan server lama jika ada
    if (nextChild) {
      nextChild.kill()
      nextChild = null
      await new Promise(r => setTimeout(r, 800))
    }

    await startNextServer(data)

    event.sender.send('server-status', { type: 'ready' })
    setupWindow?.close()

    if (mainWindow) {
      mainWindow.loadURL(`http://127.0.0.1:${PORT}`)
      mainWindow.focus()
    } else {
      createMainWindow()
    }
  } catch (err) {
    event.sender.send('server-status', { type: 'error', message: err.message })
  }
})

ipcMain.handle('load-config', () => loadConfig())

ipcMain.handle('test-db', async (_, dbUrl) => {
  if (!dbUrl) return { ok: false, message: 'URL kosong' }
  try {
    // Parse postgresql://user:pass@host:port/db
    const url = new URL(dbUrl.replace(/^postgresql:\/\//, 'pg://'))
    const host = url.hostname
    const port = parseInt(url.port || '5432', 10)
    if (!host) return { ok: false, message: 'Host tidak ditemukan di URL' }

    await new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port, timeout: 5000 })
      sock.on('connect', () => { sock.destroy(); resolve() })
      sock.on('timeout', () => { sock.destroy(); reject(new Error(`Timeout — tidak bisa menjangkau ${host}:${port}`) ) })
      sock.on('error', (e) => reject(new Error(`${host}:${port} — ${e.message}`)))
    })
    return { ok: true, message: `Host ${host}:${port} terjangkau ✓` }
  } catch (e) {
    return { ok: false, message: e.message }
  }
})

// ──────────────────────────── Startup ────────────────────────────

// Pastikan hanya satu instance yang berjalan
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
app.on('second-instance', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus() }
})

app.whenReady().then(async () => {
  buildMenu()

  const config = loadConfig()
  if (!config?.databaseUrl || !config?.geminiApiKey || !config?.adminPassword) {
    createSetupWindow()
    return
  }

  try {
    await startNextServer(config)
    createMainWindow()
  } catch (err) {
    // Server gagal start → buka setup untuk reconfigure
    const win = createSetupWindow()
    win.once('ready-to-show', () => {
      win.show()
      win.webContents.send('server-status', { type: 'error', message: err.message })
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (nextChild) nextChild.kill()
})
