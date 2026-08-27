import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

const fixtures = {
  activity: JSON.parse(readFileSync(new URL('./activity.fixture.json', import.meta.url), 'utf8')),
  interface: JSON.parse(readFileSync(new URL('./interface.fixture.json', import.meta.url), 'utf8'))
}

it.each([
  ['derives CPU use from idle CPU text', 'cpu.yml', fixtures.activity, 25],
  ['extracts active memory bytes from activity text', 'memory.yml', fixtures.activity, 128974848],
  ['extracts WAN received bytes', 'wan-received.yml', fixtures.interface, 5678],
  ['extracts WAN transmitted bytes', 'wan-transmitted.yml', fixtures.interface, 1234]
])('%s', async (_, definition, fixture, expected) => {
  await expectFixtureMetric(new URL(`./${definition}`, import.meta.url), fixture, expected)
})
