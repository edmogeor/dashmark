import { expectFixtureMetric } from '../test-utils'

it('counts unique users with unexpired Authentik sessions', async () => {
  await expectFixtureMetric(
    new URL('./logged-in-users.yml', import.meta.url),
    {
      results: [
        { user: 1, expires: '2099-01-01T00:00:00.594194Z' },
        { user: 1, expires: '2099-01-01T00:00:00Z' },
        { user: 2, expires: '2000-01-01T00:00:00Z' }
      ],
      pagination: { next: 0 }
    },
    1
  )
})
