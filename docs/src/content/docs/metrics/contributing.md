---
title: Contribute a library metric
description: Add a reusable service metric to Dashmark's bundled library.
---

Contribute reusable definitions without personal hostnames or literal credentials. See [custom metrics](/dashmark/docs/metrics/custom/) for the configuration reference.

## Definition and provider defaults

Create `metrics/<provider>/<metric-name>.yml`; its path becomes the key, such as `radarr/queue`. Use `{url}` for the card URL or `{metric_source}` for the provider's configured API URL, falling back to the card URL.

```yaml
display: { label: Queued }
value: { unit: count }
source: { url: '{metric_source}/api/v3/queue/status' }
extract: { jq: .totalCount }
```

Put shared source settings, authentication, charts, and transforms in `metrics/<provider>/provider.yml`. Keep paths, extractors, and labels in each metric. Optional non-empty `notes` in either file appear in `metrics/LIBRARY.md`.

Credentials use `env`, `file`, or Docker `label` references. Set `optional: true` only for APIs that allow anonymous access and should retry with credentials after HTTP 401/403:

```yaml
source:
  authentication:
    kind: token
    optional: true
    header: X-Api-Key
    value: { env: DASHMARK_SERVICE_API_KEY, label: dashmark.metric_api_key }
```

Declare user inputs with a label and type: `url_component` for URLs or `json_value` for JSON bodies. URL inputs can reference provider transforms before encoding:

```yaml
# provider.yml
transforms:
  endpoint_key: { trim: true, lowercase: true, replace: { ' ': '-' } }

# metric.yml
parameters:
  endpoint: { label: Endpoint, type: url_component, transform: endpoint_key }
source: { url: '{metric_source}/api/{endpoint}' }
```

Optional `<metric-name>.translations.yml` files contain locale labels, for example `en-US: { label: Queued }`. Missing translations fall back to `display.label`; do not translate keys, parameters, or extractor configuration.

## Tests and fixtures

Test against your service before submitting. Add `<metric-name>.test.ts` and sanitized response fixtures; cover relevant missing values, arrays, authentication, and reductions.

```ts
import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts queued items', async () => {
  const definition = new URL('./queue.yml', import.meta.url)
  const fixture = JSON.parse(readFileSync(new URL('./queue.fixture.json', import.meta.url), 'utf8'))
  await expectFixtureMetric(definition, fixture, 3)
})
```

For this definition, the fixture might be `{ "totalCount": 3 }`. The helper uses production parsing/resolution, preserves literal values, and replaces only secret references with `test-secret`, without reading real credentials.

The optional fourth argument supports:

| Option                     | Purpose                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputs`                   | Declared string/number/boolean inputs; omitted inputs default to `test-<name>`, unknown names fail.                                                               |
| `secrets`                  | Dummy overrides keyed by environment name, file path, or label.                                                                                                   |
| `tokens`                   | Expected extracted-token values; supply matching login response fixtures.                                                                                         |
| `onRequest(request, body)` | Sync/async inspection of every HTTP request, including optional-auth attempts; body is a raw string.                                                              |
| `responses`                | Path/query → `{body, status, headers}`, an ordered response array, or an async-capable `(request, body)` callback. Exact query matches win over pathname matches. |
| `socketEvents`             | Event → `{body}`, an ordered acknowledgement array, or an async-capable `(args)` callback returning the acknowledgement.                                          |

```ts
await expectFixtureMetric(definition, fixture, expected, {
  responses: {
    '/history': [{ body: firstPage }, { body: secondPage }],
    '/unavailable': { status: 503 },
    '/empty': { body: [] }
  },
  socketEvents: { 'read-value': [{ body: { value: 0 } }, { body: { value: 3 } }] }
})
```

- Default HTTP responses validate declared authentication and serve the configured metric request. Supply child/page responses explicitly. Login steps default to success and may be overridden; explicit responses own their status/authentication policy.
- String overrides are plain text unless `Content-Type` specifies JSON; other bodies are JSON encoded. Default fixtures follow the extractor's format.
- Socket.IO fixtures use the configured path/auth/events, validate handshake values and argument types, and default to the supplied fixture for requests or `{ok: true}` for login.
- Callback assertions fail the test. Simulate HTTP failures with response statuses, not thrown errors. Keep provider-specific payloads in provider fixtures.

## History adapters

`src/lib/uptime-recovery.ts` exposes `enqueueUptimeRecovery` for bounded fetchers with this interface:

```ts
fetchBatch(checkpoint, retentionCutoff) // → { observations, nextCheckpoint? }
```

Checkpoints are opaque strings, so adapters can use cursors or time windows without HTTP/page-order assumptions. Omit `nextCheckpoint` to finish; resume with `savedMetricRecovery`. Use an adapter-prefixed, credential-safe source fingerprint to invalidate changed configuration.

Fetchers own traversal, gap boundaries, and progress detection, and must cap responses **before decoding**. Shared methods enforce 100-observation batches and 4 KiB checkpoints, validate/filter/persist observations, and provide pacing, retries, cancellation, and UI state. HTTP paging is implemented separately in `src/lib/paginated-uptime-recovery.ts`; Socket.IO uptime extraction is also supported.

## Checks and pull request

```bash
npm run generate:metrics-library
npm run validate:metrics
npm test
npm run typecheck
npm run lint
```

The pre-commit hook updates `metrics/LIBRARY.md`; CI also runs builds. Include library changes and a user-facing `[Unreleased]` changelog entry.

Use the [metric PR template](https://github.com/edmogeor/dashmark/blob/main/.github/PULL_REQUEST_TEMPLATE/metric.md) with the key, label, value type, unit, extractor, and sanitized sample response.
