import { expectFixtureMetric } from '../test-utils'

it('extracts approved Seerr requests', async () => {
  await expectFixtureMetric(new URL('./approved.yml', import.meta.url), { approved: 4 }, 4)
})
