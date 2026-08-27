import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

const fixture = JSON.parse(readFileSync(new URL('./stats.fixture.json', import.meta.url), 'utf8'))

it.each([
  ['extracts blocked queries', 'blocked.yml', 300],
  ['extracts safe browsing, search, and parental filtering', 'filtered.yml', 35],
  ['extracts latency in milliseconds', 'latency.yml', 12],
  ['extracts DNS queries', 'queries.yml', 1200]
])('%s', async (_, definition, expected) => {
  await expectFixtureMetric(new URL(`./${definition}`, import.meta.url), fixture, expected)
})
