# Metrics

Use this guide to add metrics to a service in `config.yml`. Put all YAML metric
settings in that service's `metrics` section. Docker labels still work for
Docker-backed cards, but they use a separate format.

## Shipped Catalog

Dashmark includes a [metric catalog](https://github.com/edmogeor/dashmark/tree/main/metrics)
for supported providers. The image already includes these metrics. You do not
need to download or install them.

To use a catalog metric:

1. Find the provider and metric name in the catalog.
2. Add the metric under `metrics.catalog` in `config.yml`.
3. Set `source_url` when Dashmark must use a different API address.
4. Set any required inputs and credential environment variables.

```yaml
qbittorrent:
  url: https://qbittorrent.example.com
  metrics:
    source_url: http://qbittorrent:8080
    catalog:
      qbittorrent:
        download_speed: {}
        upload_speed: {}
```

The catalog lists provider and metric names, required inputs, and credential
variables. Define a metric under `metrics.local` only when the catalog does
not meet your need.

```yaml
radarr:
  url: https://radarr.example.com
  metrics:
    # Base URL substituted for {metrics_url} in catalog definitions.
    source_url: http://radarr:7878
    collection:
      interval: 30s
      retention: 14d
    container:
      cpu: { visible_to: admins }
      memory: {}
      network: {}
    charts:
      queue: { label: Queue, unit: count, style: line }
    catalog:
      homeassistant:
        entity-state:
          inputs: { entity_id: sensor.front_door }
          overrides:
            display: { label: Front door, chart: queue }
    local:
      active_downloads:
        display: { label: Active downloads, chart: queue }
        value: { kind: number, unit: count }
        source:
          url: http://radarr:7878/api/v3/queue/status
          headers: { X-Api-Key: { env: RADARR_API_KEY } }
        extract: { jq: .totalRecords }
```

## Service Metrics

The `metrics` section accepts these fields:

| Field | Purpose |
| --- | --- |
| `source_url` | The HTTP(S) address Dashmark uses for catalog metric requests. It replaces `{metrics_url}`. |
| `collection` | How often Dashmark collects data and how long it keeps it. Set `interval` and `retention`, for example `30s`, `15m`, or `14d`. |
| `container` | Docker CPU, memory, and network metrics. Use a list or a mapping with optional `visible_to` access rules. |
| `charts` | Named charts. Each chart has a `label`, `unit`, and `style`: `step`, `line`, or `area`. |
| `catalog` | Catalog metrics, grouped by provider. A metric can set `inputs`, `overrides`, and `visible_to`. |
| `local` | Metrics you define in this file. Each metric can set `visible_to`. |

Standalone YAML cards cannot use `container`. Use `visible_to` to limit a
metric to one access entry or a list of entries. `METRICS_ACCESS` still limits
all metric data on the server.

## Shared Sources

Use `shared_metric_sources` when local metrics on different cards use the same
HTTP API address and credentials. Define the shared connection once. Then use
its name and an absolute path in each metric.

```yaml
shared_metric_sources:
  home_assistant:
    base_url: http://homeassistant:8123
    authentication:
      kind: token
      header: Authorization
      prefix: "Bearer "
      value: { env: HOME_ASSISTANT_TOKEN }

office:
  metrics:
    local:
      temperature:
        display: { label: Office temperature }
        value: { unit: celsius }
        source:
          use: home_assistant
          path: /api/states/sensor.office_temperature
        extract: { jq: '.state | tonumber' }
```

A shared source requires `base_url`. It can define `headers`, `query`, and
`authentication`. A metric that uses it can add request-specific `headers`,
`query`, `method`, `form`, or `json`. It cannot replace the shared source's
authentication. The path must begin with `/`.

## Local Metrics

Each local metric has four sections:

| Mapping | Fields |
| --- | --- |
| `display` | The label and optional chart. |
| `value` | The value kind, unit, transform, and state labels or colors. |
| `source` | The request address, method, request data, authentication, or Socket.IO connection. |
| `extract` | One way to read the response: `jq`, `prometheus`, `text`, or `for_each`. |

Use `kind: number` with a unit such as `count`, `bytes`, or `seconds` for a
numeric value. Use `kind: state` with `default_color`, and optionally `colors`
and `labels`, for a status badge. Use `kind: string` for text. Text values do
not have units or history charts. `transform` changes a numeric value after
Dashmark reads it.

`jq` reads JSON. `prometheus` reads Prometheus samples. `text` reads a plain
text response. `for_each` finds items, requests each item, reads a numeric
value, and combines the results.

Use this form for token authentication:

```yaml
source:
  url: https://service.example.internal/status
  authentication:
    kind: token
    header: Authorization
    prefix: "Bearer "
    value: { env: SERVICE_TOKEN }
```

For HTTP Basic authentication, use `kind: basic` with `username` and
`password`. For a cookie session, use `kind: cookie_session` with up to five
`requests`. For Socket.IO, use `type: socket_io` and a `socket` section.

## Catalog Definitions

Shipped catalog metrics are YAML files at
`metrics/<provider>/<metric-name>.yml`. They use the same `display`, `value`,
`source`, and `extract` sections as local metrics. Put provider-wide settings,
such as shared headers or chart styles, in `metrics/<provider>/provider.yml`.

Catalog source URLs normally begin with `{metrics_url}`.
`service.metrics.source_url` sets that address. Otherwise, Dashmark uses the
card URL when it can. A catalog metric must declare each input. Input values
can be strings, numbers, or booleans.

## Breaking YAML Change

Dashmark does not accept the retired YAML keys: `metrics` list,
`metric_providers`, `metrics_url`, `metric_parameters`,
`metrics_poll_interval`, `metrics_history_period`, `metrics_access`, and
`custom_metrics`. Move these settings into `service.metrics`.
