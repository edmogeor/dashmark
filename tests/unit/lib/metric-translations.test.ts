import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { localizeMetricLabel } from '@/lib/metric-translations'

const directories: string[] = []
const originalMetricsDirectory = process.env.DASHMARK_METRICS_DIR

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
  if (originalMetricsDirectory === undefined) delete process.env.DASHMARK_METRICS_DIR
  else process.env.DASHMARK_METRICS_DIR = originalMetricsDirectory
})

describe('localizeMetricLabel', () => {
  it('uses an adjacent locale catalog for a library metric', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmark-metric-translations-'))
    directories.push(directory)
    const providerDirectory = path.join(directory, 'radarr')
    fs.mkdirSync(providerDirectory)
    fs.writeFileSync(
      path.join(providerDirectory, 'wanted.translations.yml'),
      `en-US:
  label: Missing movies
`
    )
    process.env.DASHMARK_METRICS_DIR = directory

    expect(localizeMetricLabel('en-US', 'radarr/wanted', 'Wanted')).toBe('Missing movies')
  })

  it('uses the metric definition label when no translation is available', () => {
    expect(localizeMetricLabel('en-US', 'radarr/wanted', 'Wanted')).toBe('Wanted')
  })
})
