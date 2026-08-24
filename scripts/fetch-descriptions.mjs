import fs from 'node:fs/promises'
import path from 'node:path'

const DATA_DIR = 'src/data'
const OUTPUT_PATH = path.join(DATA_DIR, 'descriptions.json')
const SOURCE_URLS = [
  'https://selfhst.github.io/cdn/directory/software.json',
  'https://selfhst.github.io/cdn/directory/companions.json'
]

function normalize(value) {
  return value.toLowerCase().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function parseDescriptions(data) {
  if (!Array.isArray(data)) throw new Error('selfh.st directory response was not an array')

  const descriptions = new Map()
  for (const entry of data) {
    if (!Array.isArray(entry)) continue

    const [name, reference, description] = [entry[1], entry[2], entry[5]]
    if (typeof name !== 'string' || typeof reference !== 'string' || typeof description !== 'string') continue

    const normalizedReference = normalize(reference)
    const trimmedDescription = description.trim()
    if (normalizedReference && trimmedDescription && !descriptions.has(normalizedReference)) {
      descriptions.set(normalizedReference, { reference: normalizedReference, name, description: trimmedDescription })
    }
  }

  return descriptions
}

async function main() {
  console.log('Fetching selfh.st description index...')

  const sources = await Promise.all(SOURCE_URLS.map(async url => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`selfh.st directory responded with ${response.status}`)
    return parseDescriptions(await response.json())
  }))

  const descriptions = new Map()
  for (const source of sources) {
    for (const [reference, description] of source) {
      if (!descriptions.has(reference)) descriptions.set(reference, description)
    }
  }

  if (descriptions.size === 0) throw new Error('No selfh.st descriptions were parsed')

  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify([...descriptions.values()].sort((a, b) => a.reference.localeCompare(b.reference)), null, 2))
  console.log(`Indexed ${descriptions.size} descriptions`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
