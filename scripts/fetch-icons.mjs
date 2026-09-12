import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import http from 'node:https'
import fsSync from 'node:fs'
import sharp from 'sharp'

const DATA_DIR = 'src/data'
const TARBALL_URL = 'https://github.com/selfhst/icons/archive/refs/heads/main.tar.gz'
const DASHBOARD_TARBALL_URL = 'https://github.com/homarr-labs/dashboard-icons/archive/refs/heads/main.tar.gz'
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main'
const DASHBOARD_TREE_URL = 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/tree.json'
const DASHBOARD_METADATA_URL = 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/metadata.json'
const DASHBOARD_CDN_BASE = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons'
const ANALYSIS_SIZE = 32
const BLUR_SIGMA = 4
const DARK_LUMINANCE_THRESHOLD = 0.2
const LIGHT_LUMINANCE_THRESHOLD = 0.9
const ICON_ANALYSIS_CONCURRENCY = 4

function downloadTarball(url, dest) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadTarball(res.headers.location, dest).then(resolve).catch(reject)
      }
      const file = fsSync.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
      file.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

function listTarball(tarballPath) {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-tzf', tarballPath])
    let output = ''
    tar.stdout.setEncoding('utf8')
    tar.stdout.on('data', (chunk) => {
      output += chunk
    })
    tar.on('close', (code) => {
      if (code === 0) resolve(output.split('\n'))
      else reject(new Error(`tar exited with code ${code}`))
    })
    tar.on('error', reject)
  })
}

function extractTarball(tarballPath, destination) {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', tarballPath, '-C', destination])
    tar.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar exited with code ${code}`))
    })
    tar.on('error', reject)
  })
}

function relativeLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

async function analyzeIcon(filePath) {
  try {
    const { data, info } = await sharp(filePath).resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'inside' }).blur(BLUR_SIGMA).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
    let totalLuminance = 0
    let opaquePixels = 0

    for (let i = 0; i < data.length; i += info.channels) {
      const alpha = data[i + 3] / 255
      if (alpha < 0.1) continue
      totalLuminance += relativeLuminance(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
      opaquePixels++
    }

    if (opaquePixels === 0) return undefined
    const average = totalLuminance / opaquePixels
    if (average < DARK_LUMINANCE_THRESHOLD) return 'dark'
    if (average > LIGHT_LUMINANCE_THRESHOLD) return 'light'
  } catch {
    // A malformed upstream icon should not fail the application build.
  }
}

async function fetchDashboardIcons() {
  const [treeResponse, metadataResponse] = await Promise.all([fetch(DASHBOARD_TREE_URL), fetch(DASHBOARD_METADATA_URL)])
  if (!treeResponse.ok) throw new Error(`Dashboard Icons index request failed with ${treeResponse.status}`)
  if (!metadataResponse.ok) throw new Error(`Dashboard Icons metadata request failed with ${metadataResponse.status}`)

  const [tree, metadata] = await Promise.all([treeResponse.json(), metadataResponse.json()])
  const svgRefs = new Set((Array.isArray(tree.svg) ? tree.svg : []).flatMap((file) => /^(.+)\.svg$/.exec(file)?.[1] ?? []))
  const pngRefs = new Set((Array.isArray(tree.png) ? tree.png : []).flatMap((file) => /^(.+)\.png$/.exec(file)?.[1] ?? []))
  const references = new Set([...svgRefs, ...pngRefs])
  const iconUrl = (reference, preferredExtension) => {
    const ext =
      preferredExtension && (preferredExtension === 'svg' ? svgRefs : pngRefs).has(reference) ? preferredExtension : svgRefs.has(reference) ? 'svg' : pngRefs.has(reference) ? 'png' : undefined
    return ext ? `${DASHBOARD_CDN_BASE}/${ext}/${reference}.${ext}` : undefined
  }

  return [...references]
    .filter((reference) => !/-(dark|light)$/.test(reference))
    .map((reference) => {
      const colors = metadata[reference]?.colors
      const url = iconUrl(reference, metadata[reference]?.base)
      return {
        reference,
        name: reference.replace(/[-_]/g, ' '),
        url,
        ...(typeof colors?.dark === 'string' && { darkUrl: iconUrl(colors.dark) }),
        ...(typeof colors?.light === 'string' && { lightUrl: iconUrl(colors.light) })
      }
    })
    .filter((icon) => Boolean(icon.url))
    .sort((a, b) => a.reference.localeCompare(b.reference))
}

async function analyzeIcons(iconSets, contrasts) {
  const sources = iconSets.flatMap(({ icons, root }) =>
    icons.map((icon) => ({
      icon,
      path: path.join(root, new URL(icon.url).pathname.split('/').slice(-2).join('/'))
    }))
  )
  let nextSourceIndex = 0

  // Match Node's default libuv pool size without creating work for every icon at once.
  await Promise.all(
    Array.from({ length: Math.min(ICON_ANALYSIS_CONCURRENCY, sources.length) }, async () => {
      while (nextSourceIndex < sources.length) {
        const { icon, path: iconPath } = sources[nextSourceIndex++]
        const contrast = await analyzeIcon(iconPath)
        if (contrast) contrasts[icon.url] = contrast
      }
    })
  )
}

async function main() {
  console.log('Fetching icon index...')

  await fs.mkdir(DATA_DIR, { recursive: true })
  const tempDir = path.join(process.cwd(), '.tmp-icons')
  const tarballPath = path.join(tempDir, 'icons.tar.gz')
  const dashboardTarballPath = path.join(tempDir, 'dashboard-icons.tar.gz')

  try {
    await fs.mkdir(tempDir, { recursive: true })
    await Promise.all([downloadTarball(TARBALL_URL, tarballPath), downloadTarball(DASHBOARD_TARBALL_URL, dashboardTarballPath)])
    const entries = await listTarball(tarballPath)
    await Promise.all([extractTarball(tarballPath, tempDir), extractTarball(dashboardTarballPath, tempDir)])

    const svgRefs = new Set()
    const pngRefs = new Set()

    for (const entry of entries) {
      const match = entry.match(/^icons-main\/(svg|png)\/(.+?)\.(svg|png)$/)
      if (!match) continue
      const [, dir, reference] = match
      if (/-(dark|light)$/.test(reference)) continue

      if (dir === 'svg') svgRefs.add(reference)
      else pngRefs.add(reference)
    }

    const allRefs = new Set([...svgRefs, ...pngRefs])
    const icons = []

    for (const reference of allRefs) {
      const ext = svgRefs.has(reference) ? 'svg' : 'png'
      icons.push({
        reference,
        name: reference.replace(/[-_]/g, ' '),
        url: `${CDN_BASE}/${ext}/${reference}.${ext}`
      })
    }

    icons.sort((a, b) => a.reference.localeCompare(b.reference))

    const dashboardIcons = await fetchDashboardIcons()
    const contrasts = {}
    await analyzeIcons(
      [
        { icons, root: path.join(tempDir, 'icons-main') },
        { icons: dashboardIcons, root: path.join(tempDir, 'dashboard-icons-main') }
      ],
      contrasts
    )
    await fs.writeFile(path.join(DATA_DIR, 'icons.json'), JSON.stringify({ selfhst: icons, dashboard: dashboardIcons }, null, 2))
    await fs.writeFile(path.join(DATA_DIR, 'icon-contrast.json'), JSON.stringify(contrasts, null, 2))
    console.log(`Indexed ${icons.length} selfh.st icons, ${dashboardIcons.length} Dashboard Icons, and ${Object.keys(contrasts).length} contrast values`)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
