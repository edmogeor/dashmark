import { expectFixtureMetric } from '../test-utils'

it('extracts processing Seerr requests', async () => {
  await expectFixtureMetric(new URL('./processing.yml', import.meta.url), { processing: 2 }, 2)
})
