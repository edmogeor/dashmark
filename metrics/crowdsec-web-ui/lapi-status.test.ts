import { expectFixtureMetric } from '../test-utils'

it('reports CrowdSec LAPI connectivity', async () => {
  await expectFixtureMetric(
    new URL('./lapi-status.yml', import.meta.url),
    {
      lapi_status: { isConnected: true }
    },
    'connected'
  )
})
