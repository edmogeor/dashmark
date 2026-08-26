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
