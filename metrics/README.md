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
can only be selected by a card that lists `radarr` in `metric_providers`:

```yaml
media-radarr:
  metric_providers: radarr
  metrics: [cpu, memory, network, radarr/active_downloads]
```

The field accepts one provider, CSV, or a YAML list. A card can select metrics
from multiple catalog providers. Dashmark does not infer providers from a
container image or name.
`sonarr/active_downloads` is rejected unless `sonarr` is listed. Docker labels
use CSV, for example `dashmark.metric_providers=radarr,sonarr`.

Locally defined unscoped metric keys, such as `active_downloads`, do not need a
provider binding.

## Metric Definition

Each entry under `custom_metrics` needs:

| Field | Required | Description |
| --- | --- | --- |
| `label` | Yes | Display label in the Metrics tooltip. |
| `source.url` | Yes | Explicit HTTP or HTTPS endpoint. |
| `source.method` | No | `GET` (default) or `POST`. POST may define exactly one `form` or `json` body. |
| `source.headers` / `source.query` | No | Header or query values referenced from an environment variable, file, or optional literal label. |
| `source.auth` | No | HTTP Basic credentials or a bounded cookie-session request flow. |
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

### HTTP Basic authentication

Use `source.auth` with `type: basic` for APIs that use HTTP Basic credentials.
`username` and `password` accept environment-variable or secret-file references,
with optional Docker label overrides.

```yaml
source:
  url: "{url}/api/status"
  auth:
    type: basic
    username:
      env: DASHMARK_SERVICE_API_KEY
      label: dashmark.metric_api_key
    password:
      env: DASHMARK_SERVICE_API_SECRET
      label: dashmark.metric_api_secret
```

### Cookie-session authentication

Use `source.auth` when a metric endpoint needs a session cookie or an
anti-forgery handshake. Its one to five `steps` run in order with the metric's
cached cookie jar, then Dashmark fetches the metric with that same jar. A step
uses `GET` by default or `POST`; a POST may define one `form` or `json` body.
Header, query, and body values use secret references. A step may extract up to
16 named values, which can only be injected explicitly into a later request
with `{ token: name }`.

```yaml
source:
  url: "{url}/api/v2/transfer/info"
  auth:
    type: cookie_session
    steps:
      - url: "{url}/api/v2/auth/login"
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

Metric sources may use `{url}` for both metric and login URLs. Sources that
need a separate API base can use `{metrics_url}`, which resolves to the card's
optional `metrics_url` and otherwise falls back to its `url`. In Docker,
`dashmark.metrics_url` provides that API base; YAML `metrics_url` overrides
the Docker label. `label` values override their `env` or `file` defaults for
that container.
Docker labels are visible through Docker APIs and inspect output, so prefer
environment variables or secret files.

### OPNsense catalog metrics

The `opnsense` catalog provider uses HTTP Basic authentication with the API key
as its username and API secret as its password. Create a dedicated API key for
a user with the required diagnostics privileges, then select the metrics with
`metric_providers: opnsense` and `metrics: [opnsense/cpu,
opnsense/memory, opnsense/wan-received, opnsense/wan-transmitted]`.

The defaults are `DASHMARK_OPNSENSE_API_KEY` and
`DASHMARK_OPNSENSE_API_SECRET`. Per-container `dashmark.metric_api_key` and
`dashmark.metric_api_secret` labels override those defaults, but labels expose
their values through Docker APIs and should only be used when that exposure is
acceptable. CPU use is derived from the idle CPU text returned by
`/api/diagnostics/activity/getActivity`; active memory is converted from its
reported K, M, G, or T value to bytes. WAN metrics use the default `wan`
interface from `/api/diagnostics/traffic/interface` and report its cumulative
received and transmitted byte counters.

Set `metrics_url` to the OPNsense API base when it differs from the card link,
for example when Dashmark reaches OPNsense through a private address.

See the [OPNsense API documentation](https://docs.opnsense.org/development/how-tos/api.html)
for API-key creation and HTTP Basic authentication.

### CSRF and response tokens

`extract` accepts exactly one extractor per token. Use `cheerio` to select an
HTML element and read its text or named attribute, or `jq` to select one
non-empty JSON string. The token is not interpolated into URLs or strings. Add
it deliberately to a later `headers`, `query`, `json`, or `form` mapping:

```yaml
source:
  url: http://service:8080/api/metric
  method: POST
  headers:
    X-Api-Token: { token: api_token }
  query:
    token: { token: api_token }
  json:
    token: { token: api_token }
  auth:
    type: cookie_session
    steps:
      - url: http://service:8080/login
        extract:
          csrf:
            cheerio:
              selector: 'input[name="csrf"]'
              attribute: value
      - url: http://service:8080/session
        method: POST
        form:
          csrf: { token: csrf }
        extract:
          api_token: { jq: .token }
```

This keeps values out of logs and limits them to explicit request fields. An
unavailable or empty token fails that metric collection safely.

### Socket.IO request metrics

Use `transport: socketio` for APIs that return a metric through a Socket.IO
event acknowledgement. Dashmark opens a connection for each poll, applies
optional handshake authentication and login, then emits the request event and
passes its acknowledgement to `jq`.

```yaml
custom_metrics:
  private_status:
    label: Status
    unit: boolean
    source:
      transport: socketio
      url: http://service:3001
      socketio:
        auth:
          token: { env: SERVICE_TOKEN }
        login:
          event: loginByToken
          args: [metrics]
        request:
          event: getMonitor
          args: [42]
    jq: 'if .status == 1 then 1 else 0 end'
```

`socketio.auth` values are secret references. `login` and `request` event
arguments may be strings, finite numbers, booleans, or secret references.
Socket.IO sources require `jq`; Prometheus extraction and streaming event
subscriptions are not supported.

## Choosing an Extractor

Prefer `jq` when the service exposes a JSON REST API: it selects and aggregates
individual fields precisely. Prefer `prometheus` only when the service natively
exposes a Prometheus text endpoint (`/metrics`) and no JSON API is available.
Do not require a separate exporter sidecar just to use `prometheus`.

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

## Limitations

HTTP metric sources support `GET` and bounded `POST` form or JSON requests.
Cookie-session flows support up to five sequential requests and explicit CSRF
or JSON token injection, but do not follow redirects, execute JavaScript,
interpolate values into URLs, or support arbitrary request methods. Socket.IO
metric behavior is unchanged.

A `{url}`- or `{metrics_url}`-based metric is omitted when its card has no
resolvable base URL. When a required
secret cannot be resolved (for example an unset environment variable), the
metric reports `Credential ... is unavailable` and is omitted. There is no way
to express "authenticate only if credentials are present"; a metric that
declares a header always requires it.

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

Each `.yml` file is self-contained: there is no shared source. Repeat the full
`source` (and `auth`) block in every metric that needs it. Catalog metrics must
define a reusable `source.url`, normally with `{url}` or `{metrics_url}`, because Dashmark loads
only definitions with a source. Never include a private URL, hostname,
credential, token, or personal identifier.

Name secret environment variables `DASHMARK_<PROVIDER>_<NAME>`, for example
`DASHMARK_RADARR_API_KEY`, and expose a per-container override label such as
`dashmark.metric_api_key`. HTTP POST requests and bounded cookie-session flows
are acceptable when they use portable `{url}` or `{metrics_url}` endpoints and secret references.
Include public upstream API documentation for every endpoint and authentication
flow. Socket.IO metrics are acceptable when their endpoint is portable from the
card URL and their acknowledgement API is publicly documented.

`CATALOG.md` is validated strictly against the metric files. Every file must
have exactly one row, and every row must match a file. List the graph group in
backticks, or a bare `-` when the metric has no `chart_group`.

The directory path is the metric key. For example,
`metrics/radarr/active_downloads.yml` becomes `radarr/active_downloads`, which
users select with `metrics: [radarr/active_downloads]`. This keeps provider
metrics with the same name distinct, such as `sonarr/active_downloads`.

The contributed YAML should define a `source` URL beginning with `{url}` or
`{metrics_url}`. Dashmark replaces `{url}` with the card URL and
`{metrics_url}` with the configured metrics URL, falling back to the card URL,
at runtime. Header and query
credentials can use a default `env` or `file` reference and an optional literal
Docker-label override:

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

Add a colocated extraction test at
`metrics/<provider>/<metric-name>.test.ts`. Use a sanitized inline response for
small payloads; add a sibling `<metric-name>.fixture.json` when a response is
large or shared by multiple tests. Tests must cover the selected value and any
relevant missing, array, reduction, token, or authentication behavior. `npm
run validate:metrics` checks file structure and catalog rows only; run `npm
test` to execute metric tests.

Never submit private URLs, hostnames, API keys, secret files, or personal card
names.
