import fs from 'node:fs/promises'

const SOURCE_URLS = [
  'https://raw.githubusercontent.com/awesome-selfhosted/awesome-selfhosted/master/README.md',
  'https://raw.githubusercontent.com/awesome-selfhosted/awesome-selfhosted/master/non-free.md'
]
const OUTPUT_PATH = 'src/data/descriptions.json'

function normalize(value) {
  return value.toLowerCase().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function cleanDescription(value) {
  return value
    .replace(/\s+\(\[(?:Demo|Source Code|Clients)\].*$/, '')
    .replace(/\s+`[^`]+`(?:\s+`[^`]+`)*$/, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .trim()
}

function parseDescriptions(markdown) {
  const descriptions = new Map()
  const entry = /^- \[([^\]]+)]\([^)]*\)(?:\s+`[^`]+`)?\s+-\s+(.+)$/gm

  for (const match of markdown.matchAll(entry)) {
    const [, name, rawDescription] = match
    const reference = normalize(name)
    const description = cleanDescription(rawDescription)
    if (reference && description && !descriptions.has(reference)) {
      descriptions.set(reference, { reference, name, description })
    }
  }

  return [...descriptions.values()].sort((a, b) => a.reference.localeCompare(b.reference))
}

async function main() {
  console.log('Fetching Awesome Selfhosted descriptions...')
  const sources = await Promise.all(SOURCE_URLS.map(async url => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Awesome Selfhosted responded with ${response.status}`)
    return response.text()
  }))
  const descriptions = parseDescriptions(sources.join('\n'))
  if (descriptions.length === 0) throw new Error('No Awesome Selfhosted descriptions were parsed')

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(descriptions, null, 2))
  console.log(`Indexed ${descriptions.length} descriptions`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
