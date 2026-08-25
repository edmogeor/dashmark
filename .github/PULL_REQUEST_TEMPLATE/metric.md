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
is its metric key, for example `radarr/active_downloads`. Include only reusable
extraction fields. Do not include `source.url`, headers, credentials, private
hostnames, or personal card names. -->

```yaml
# custom_metrics:
#   metric_key:
#     label: Example
#     unit: count
#     jq: .value
```

## Validation

<!-- Explain how the extractor behaves for missing values, arrays, labels, and
reductions. -->

## Checklist

- [ ] The definition contains no private URLs, hostnames, credentials, or secret references.
- [ ] I created `metrics/<provider>/<metric-name>.yml` in my fork.
- [ ] I added the provider, metric key, graph group, and author to `metrics/CATALOG.md`.
- [ ] I ran `npm run validate:metrics` locally.
- [ ] I added a sanitized fixture and extraction tests.
- [ ] I documented the metric in its provider-specific documentation.
- [ ] I ran `npm test`, `npm run typecheck`, and `npm run lint` locally.
- [ ] I updated `CHANGELOG.md` under `[Unreleased]` if this is user-facing.
- [ ] My commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## Related

<!-- Link related issues or PRs, for example: Closes #123 -->
