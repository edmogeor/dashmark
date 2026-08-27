import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const contentDirectory = fileURLToPath(new URL('../src/content/docs/', import.meta.url))
const outputFile = fileURLToPath(new URL('../public/llms-full.txt', import.meta.url))

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? markdownFiles(path) : entry.name.match(/\.mdx?$/) ? [path] : []
  }))
  return files.flat().sort()
}

const files = await markdownFiles(contentDirectory)
const documents = await Promise.all(files.map(async (file) => {
  const source = await readFile(file, 'utf8')
  return `<!-- Source: ${relative(contentDirectory, file)} -->\n\n${source.trim()}`
}))

await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, `# Dashmark documentation\n\nThis file is generated from the Dashmark documentation source.\n\n${documents.join('\n\n---\n\n')}\n`)
