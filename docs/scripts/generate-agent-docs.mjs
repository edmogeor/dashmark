import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, relative } from 'node:path'

const contentDirectory = fileURLToPath(new URL('../src/content/docs/', import.meta.url))
const outputDirectory = fileURLToPath(new URL('../../dist/client/docs/', import.meta.url))
const siteUrl = 'https://edmogeor.github.io/dashmark/docs'

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? markdownFiles(path) : entry.name.match(/\.mdx?$/) ? [path] : []
    })
  )
  return files.flat().sort()
}

const files = await markdownFiles(contentDirectory)
const links = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const relativePath = relative(contentDirectory, file).replace(extname(file), '.md')
  const outputFile = join(outputDirectory, relativePath)
  await mkdir(dirname(outputFile), { recursive: true })
  await writeFile(outputFile, source)
  links.push(`- [${relativePath}](${siteUrl}/${relativePath})`)
}

await writeFile(
  join(outputDirectory, 'llms.txt'),
  `# Dashmark Documentation\n\n> Dashmark is a lightweight dashboard for Docker services.\n\nEach documentation page is also available as Markdown.\n\n## Markdown documentation\n\n${links.join('\n')}\n\n## Source and support\n\n- [Repository](https://github.com/edmogeor/dashmark)\n- [Documentation source](https://github.com/edmogeor/dashmark/tree/main/docs/src/content/docs)\n- [Configuration examples](https://github.com/edmogeor/dashmark/tree/main/config)\n`
)
