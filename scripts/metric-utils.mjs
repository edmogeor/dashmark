import fs from 'node:fs'
import path from 'node:path'

export function metricFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return metricFiles(file)
    return entry.name.endsWith('.yml') && entry.name !== 'provider.yml' ? [file] : []
  })
}

export function sourceWithDefaults(provider, metric) {
  const defaults = provider.source ?? {}
  const source = metric.source ?? {}
  return {
    ...defaults,
    ...source,
    ...(defaults.headers || source.headers ? { headers: { ...defaults.headers, ...source.headers } } : {}),
    ...(defaults.query || source.query ? { query: { ...defaults.query, ...source.query } } : {})
  }
}
