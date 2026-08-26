import { expectFixtureMetric } from '../test-utils'

it('extracts completed Seerr requests and falls back to available', async () => {
  await expectFixtureMetric(new URL('./completed.yml', import.meta.url), { available: 9 }, 9)
})
