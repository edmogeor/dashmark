---
title: Contribute a library metric
description: Add a reusable service metric to Dashmark's bundled library.
---

Contribute a library metric when it can work for other Dashmark users. The definition must not contain personal hostnames, API keys, tokens, or other secrets.

## 1. Create the metric file

Create `metrics/<provider>/<metric-name>.yml`. Its path becomes the metric key, for example `radarr/queue`.

Use `{url}` or `{metric_source}` in source URLs. Dashmark replaces `{url}` with the card URL and `{metric_source}` with the configured source for the metric provider, falling back to the card URL.

```yaml
display:
  label: Queued
value:
  unit: count
source:
  url: "{metric_source}/api/v3/queue/status"
extract:
  jq: .totalCount
```

## 2. Add authentication when needed

Declare reusable credential references in `metrics/<provider>/provider.yml`. Use environment variables, secret files, or labels, never literal credentials.

```yaml
source:
  authentication:
    kind: token
    optional: true
    header: X-Api-Key
    value:
      env: DASHMARK_RADARR_API_KEY
      label: dashmark.metric_api_key
```

Set `optional: true` only when the metric can be requested anonymously and should retry with credentials after a `401` or `403` response.

## 3. Declare inputs and provider defaults

If a metric needs a value from the user, declare it in the metric file. Use `url_component` when the value appears in a URL, or `json_value` when it appears in a JSON request body.

```yaml
parameters:
  entity_id:
    label: Entity ID
    type: url_component
source:
  url: "{metric_source}/api/states/{entity_id}"
```

Keep source settings shared by a provider, such as authentication, headers, query parameters, chart groups, and URL value transforms, in `metrics/<provider>/provider.yml`. Keep service-specific paths, extractors, and labels in each metric file. Add an optional non-empty `notes` string to either file for usage requirements or caveats; it appears in the generated metric library table.

Provider transforms let a metric safely normalize a `url_component` input before it is URL encoded. They can trim, lowercase, and apply literal string replacements:

```yaml
# metrics/<provider>/provider.yml
transforms:
  endpoint_key:
    trim: true
    lowercase: true
    replace:
      " ": "-"

# metrics/<provider>/<metric-name>.yml
parameters:
  endpoint:
    label: Endpoint name
    type: url_component
    transform: endpoint_key
```

## 4. Add tests

Test the metric against your own service instance before submitting it. Add `metrics/<provider>/<metric-name>.test.ts`, and include a sanitized fixture when it helps cover the API response or extractor. Cover missing values, arrays, authentication, and reductions where they apply.

For a JSON metric, pair a fixture with a focused extraction test:

```ts
import { readFileSync } from 'node:fs'
import { expectFixtureMetric } from '../test-utils'

it('extracts queued items', async () => {
  const definition = new URL('./queue.yml', import.meta.url)
  const fixture = JSON.parse(readFileSync(new URL('./queue.fixture.json', import.meta.url), 'utf8'))

  await expectFixtureMetric(definition, fixture, 3)
})
```

`queue.fixture.json` contains a sanitized response such as `{ "totalCount": 3 }`. The final argument is the value expected from the metric's extractor.

## 5. Automatic checks

The pre-commit hook updates `metrics/LIBRARY.md` when staged metric definitions change. Pull requests automatically run metric validation, linting, type checks, tests, and builds.

Run these commands locally when you want to check your work before opening a pull request:

```bash
npm run generate:metrics-library
npm run validate:metrics
npm test
npm run typecheck
npm run lint
```

Include the generated `metrics/LIBRARY.md` change and add a user-facing entry under `[Unreleased]` in `CHANGELOG.md`.

## 6. Open a pull request

Use the [metric pull request template](https://github.com/edmogeor/dashmark/blob/main/.github/PULL_REQUEST_TEMPLATE/metric.md). Include the metric key, display label, value type, unit, extractor, and a sanitized sample response when needed.
