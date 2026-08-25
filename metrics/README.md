# Custom Metrics

Dashmark can show custom metrics for Docker-backed cards. A metric definition
belongs in the service's `custom_metrics` block in `config.yml`; it is then
selected with the service's `metrics` list or the container's
`dashmark.metrics` label.

Custom metrics have explicit sources. Dashmark never infers service addresses,
ports, credentials, or endpoints from a container.

## Quick Start

This JSON endpoint returns the number of active downloads:

```json
{"queue":{"active":3}}
```

Define and select it:

```yaml
radarr:
  metrics: [cpu, active_downloads]

  custom_metrics:
    active_downloads:
      label: Active downloads
      unit: count
      source:
        url: http://radarr:7878/api/queue/stats
        headers:
          X-Api-Key:
            env: RADARR_API_KEY
      jq: .queue.active
```

The equivalent Docker label is:

```yaml
labels:
  dashmark.metrics: cpu,active_downloads
```

The source definition remains in `config.yml`; labels only select which
metrics are shown.

When `metrics` is omitted, a card shows its four built-in readings: CPU,
memory, receiving, and sending. A `metrics` list is an explicit selection, so
include the built-ins you want to retain alongside custom metrics.

## Provider Binding

Contributed metrics are provider-scoped. A catalog metric at
`metrics/radarr/active_downloads.yml` has the key `radarr/active_downloads` and
can only be selected by a card explicitly bound to `radarr`:

```yaml
media-radarr:
  metric_provider: radarr
  metrics: [cpu, memory, network, radarr/active_downloads]
```

The card name can be anything. Dashmark does not infer the provider from a
container image or name. `sonarr/active_downloads` on this card is rejected.
Docker labels can use the equivalent `dashmark.metric_provider=radarr`.

Locally defined unscoped metric keys, such as `active_downloads`, do not need a
provider binding.

### Catalog source bindings

Catalog metrics derive their endpoint from the card URL. When required, a
catalog metric defines its default credential environment variable. Override
that credential for one container with a literal `dashmark.metric_api_key`
label:

```yaml
media-radarr:
  metric_provider: radarr
  metrics: [radarr/queue-depth]
  # Optional. The catalog defaults to DASHMARK_RADARR_API_KEY.
  # Docker labels are visible through Docker APIs and inspect output.
  # dashmark.metric_api_key: literal-api-key
```

Set the catalog's documented default variable on the Dashmark container, such
as `DASHMARK_RADARR_API_KEY`. A literal metric label takes precedence, but is
not recommended because Docker labels are not secret storage.

## Metric Definition

Each entry under `custom_metrics` needs:

| Field | Required | Description |
| --- | --- | --- |
| `label` | Yes | Display label in the Metrics tooltip. |
| `source.url` | Yes | Explicit HTTP or HTTPS endpoint. |
| `source.headers` / `source.query` | No | Header or query values referenced from an environment variable, file, or optional literal label. |
| `source.auth` | No | Cookie-session login request for endpoints that require an authenticated browser session. |
| `jq` or `prometheus` | Yes | Exactly one extractor. |
| `unit` | Numeric only | Display unit, defaults to `number`. |
| `chart` | Numeric only | `step` (default), `line`, `area`, or `none`. |
| `chart_group` | Numeric only | Lowercase group ID that combines compatible selected metrics into one chart. |
| `transform` | Numeric only | Optional `{ multiply: number, add: number }` applied after extraction. |
| `value_type` | No | `number` (default) or `string`. |

Do not put literal credentials in YAML. Use one secret reference per header:

```yaml
headers:
  Authorization:
    env: SERVICE_TOKEN
  X-Api-Key:
    file: /run/secrets/service_api_key
```

### Cookie-session authentication

Use `source.auth` when a metric endpoint first requires a login that sets a
session cookie. Dashmark sends the login request with the metric's cached
cookie jar, then fetches the metric with that same jar. The login method is
always `POST`; it must define exactly one non-empty `form` or `json` mapping.
Header, query, and body values all use secret references:

```yaml
source:
  url: "{url}/api/v2/transfer/info"
  auth:
    type: cookie_session
    login:
      url: "{url}/api/v2/auth/login"
      method: POST
      form:
        username:
          env: DASHMARK_QBITTORRENT_USERNAME
          label: dashmark.metric_username
        password:
          env: DASHMARK_QBITTORRENT_PASSWORD
          label: dashmark.metric_password
jq: .dl_info_speed
```

Catalog metrics may use `{url}` for both metric and login URLs. In Docker,
`label` values override their `env` or `file` defaults for that container.
Use `dashmark.metric_username` and `dashmark.metric_password` for the bundled
qBittorrent metrics. Docker labels are visible through Docker APIs and inspect
output, so prefer environment variables or secret files.

## jq Metrics

`jq` expressions select and transform values from JSON responses. Each
expression must produce exactly one value of the metric's declared type.

```yaml
custom_metrics:
  active_downloads:
    label: Active downloads
    unit: count
    source:
      url: http://service:8080/stats
    jq: .queue.active
```

Use jq to aggregate arrays:

```yaml
custom_metrics:
  queued_bytes:
    label: Queued data
    unit: bytes
    source:
      url: http://service:8080/queue
    jq: '[.items[].size_bytes] | add'
```

For example, use `length` to count selected entries, `add` to sum values, or
`add / length` to calculate an average.

## Prometheus Metrics

Prometheus endpoints expose numeric samples in text form:

```text
queue_depth{queue="downloads"} 4
```

Select a metric name and optional label matchers:

```yaml
custom_metrics:
  downloads:
    label: Downloads
    unit: count
    source:
      url: http://service:9090/metrics
    prometheus:
      name: queue_depth
      labels:
        queue: downloads
```

When multiple samples match, use a reduction. Prometheus sample values are
numeric; see text metrics below for extracting a string label from an info
metric.

## Text Metrics

Text metrics show a current string only. They are not stored as history and do
not open a chart dialog.

```yaml
custom_metrics:
  service_status:
    label: Status
    value_type: string
    source:
      url: http://service:8080/status
    jq: .status
```

For Prometheus info metrics, select one matching sample and use `value_label`:

```yaml
custom_metrics:
  version:
    label: Version
    value_type: string
    source:
      url: http://service:9090/metrics
    prometheus:
      name: service_info
      value_label: version
```

Text metrics cannot define a unit or chart.

## Charts

Numeric metrics open a history chart by default. Set `chart` to choose its
rendering: `step` holds each sampled value until the next sample, `line`
connects samples directly, and `area` fills beneath the sampled values. Set
`chart: none` to show the current value without making the metric interactive:

```yaml
custom_metrics:
  queue_depth:
    label: Queue depth
    unit: count
    chart: none
    source:
      url: http://service:8080/stats
    jq: .queue.depth
```

### Multi-series charts

Give compatible selected numeric metrics the same `chart_group` to display them
together. Each metric keeps its own current value, source, and history;
selecting either metric opens the shared chart. All members of a group must use
the same `unit` and `chart`, and `chart` cannot be `none`.

```yaml
custom_metrics:
  read_rate:
    label: Read
    unit: bytes_per_second
    chart: line
    chart_group: disk_io
    source: { url: http://service:8080/stats }
    jq: .disk.read_bytes_per_second
  write_rate:
    label: Write
    unit: bytes_per_second
    chart: line
    chart_group: disk_io
    source: { url: http://service:8080/stats }
    jq: .disk.write_bytes_per_second
```

Chart series use Dashmark's separate `--dashmark-chart-color-0` through
`--dashmark-chart-color-7` CSS variables. Override those variables in a custom
stylesheet to change the palette without affecting badge colors.

## Units

Numeric metrics support `number`, `count`, `percent`, `ratio`, `bytes`,
`bytes_per_second`, `bits`, `bits_per_second`, `seconds`, `milliseconds`,
`microseconds`, `duration`, `hertz`, `watts`, `volts`, `amperes`, `celsius`,
`fahrenheit`, and `boolean`.

Use a custom suffix when no built-in unit fits:

```yaml
unit:
  suffix: jobs
```

`percent` expects values from 0 to 100. `ratio` expects values from 0 to 1 and
is displayed as a percentage. `duration` expects seconds and selects a compact
time display automatically.

Use `transform` to convert a source value before formatting. For example, a
metric returning MiB can use `transform: { multiply: 1048576 }` with `unit:
bytes`.

## Errors

Invalid selected definitions display an availability toast with a safe,
specific validation message. Fetch and extraction failures also display an
availability toast, omit the metric from the tooltip, and are logged server
side. Secrets and URL query strings are never included in these logs.

## Contributing Metrics

You do not need to contribute a metric to use it. To share a reusable metric:

1. Fork this repository.
2. Add `metrics/<provider>/<metric-name>.yml`, for example
   `metrics/radarr/active_downloads.yml`.
3. Add the provider, metric key, graph group, and author to
   [`metrics/CATALOG.md`](CATALOG.md).
4. Add sanitized fixtures and extraction tests.
5. Open a pull request using the **Custom Metric** template.

The pull request runs `npm run validate:metrics`. Definitions that do not meet
the schema fail automatically; valid definitions proceed to maintainer review.

The directory path is the metric key. For example,
`metrics/radarr/active_downloads.yml` becomes `radarr/active_downloads`, which
users select with `metrics: [radarr/active_downloads]`. This keeps provider
metrics with the same name distinct, such as `sonarr/active_downloads`.

The contributed YAML may define a `source` URL beginning with `{url}`. Dashmark
replaces `{url}` with the card URL at runtime. Header and query credentials can
use a default `env` or `file` reference and an optional literal Docker-label
override:

```yaml
label: Queue depth
unit: count
source:
  url: "{url}/api/v3/queue/status"
  headers:
    X-Api-Key:
      env: DASHMARK_RADARR_API_KEY
      label: dashmark.metric_api_key
jq: .totalCount
```

Never submit private URLs, hostnames, API keys, secret files, or personal card
names.
