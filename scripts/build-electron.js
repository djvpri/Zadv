/**
 * Build script: Next.js standalone → copy assets → electron-builder portable
 * Jalankan: node scripts/build-electron.js
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')

function run(cmd, opts = {}) {
  console.log('\n>', cmd)
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts })
}

function cp(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP (tidak ada): ${src}`)
    return
  }
  fs.cpSync(src, dst, { recursive: true, force: true })
  console.log(`  ✓ ${path.relative(root, src)} → ${path.relative(root, dst)}`)
}

// 1. Build Next.js dalam mode standalone
console.log('\n═══ [1/3] Build Next.js standalone ═══')
run('npx next build', { env: { ...process.env, BUILD_TARGET: 'electron' } })

// 2. Copy static assets ke dalam folder standalone
console.log('\n═══ [2/3] Copy static assets ═══')
const standalone = path.join(root, '.next', 'standalone')
cp(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'))
cp(path.join(root, 'public'),          path.join(standalone, 'public'))

// 3. Package dengan electron-builder
console.log('\n═══ [3/3] Package Electron portable ═══')
run('npx electron-builder --win portable --x64')

console.log('\n✓ Build selesai. Output ada di: dist-electron/')
