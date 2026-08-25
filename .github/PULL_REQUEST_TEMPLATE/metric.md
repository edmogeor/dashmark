## Custom Metric

<!-- Describe the reusable metric this PR adds. Do not include a personal
endpoint, hostname, API key, token, cookie, or secret file path. -->

**Metric key:**

**Display label:**

**Value type:** `number` / `string`

**Unit:**

**Extractor:** `jq` / `prometheus`

## Upstream Source

<!-- Link the public upstream documentation for the endpoint or metric. Include
a sanitized sample response or Prometheus sample below when documentation is
not sufficient. -->

## Metric File

<!-- Add this metric as `metrics/<provider>/<metric-name>.yml`. The file path
is its metric key, for example `radarr/active_downloads`. Include a reusable
`source` block, normally using `{url}` or `{metrics_url}`, plus reusable env/file secret
references. Do not include private URLs, hostnames, literal credentials,
tokens, or personal card names. -->

```yaml
label: Example
unit: count
source:
  url: "{url}/api/stats"
  headers:
    X-Api-Key:
      env: DASHMARK_PROVIDER_API_KEY
      label: dashmark.metric_api_key
jq: .value
```

## Validation

<!-- Explain how the extractor behaves for missing values, arrays, labels,
reductions, authentication, and token extraction where applicable. Include
the public upstream API documentation URL. -->

## Checklist

- [ ] The definition contains no private URLs, hostnames, literal credentials, tokens, or personal identifiers.
- [ ] The reusable source uses `{url}` or `{metrics_url}` and env/file secret references where required.
- [ ] I created `metrics/<provider>/<metric-name>.yml` in my fork.
- [ ] I added the provider, metric key, graph group, and author to `metrics/CATALOG.md`.
- [ ] I ran `npm run validate:metrics` locally.
- [ ] I added `metrics/<provider>/<metric-name>.test.ts`, with a sibling sanitized fixture when useful.
- [ ] I documented the metric in its provider-specific documentation.
- [ ] I ran `npm test`, `npm run typecheck`, and `npm run lint` locally.
- [ ] I updated `CHANGELOG.md` under `[Unreleased]` if this is user-facing.
- [ ] My commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## Related

<!-- Link related issues or PRs, for example: Closes #123 -->
