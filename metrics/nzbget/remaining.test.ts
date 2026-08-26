import { expectFixtureMetric } from '../test-utils'

it('extracts the NZBGet remaining download size', async () => {
  await expectFixtureMetric(new URL('./remaining.yml', import.meta.url), { result: { RemainingSizeMB: 12.5 } }, 13107200)
})
