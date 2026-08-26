# Metrics

Use this guide to add metrics in `config.yml`. Put YAML metric settings in the
service's `metrics` section. Docker-backed cards can also use Docker labels.

## Contents

- [Shipped catalog](#shipped-catalog)
- [Service metrics](#service-metrics)
- [Shared sources](#shared-sources)
- [Local metrics](#local-metrics)
- [Contributing catalog metrics](#contributing-catalog-metrics)

## Shipped catalog

Dashmark includes a [metric catalog](https://github.com/edmogeor/dashmark/tree/main/metrics)
for supported providers. Catalog metrics are reusable definitions included in
the image. Local metrics are definitions for one service.

To use a catalog metric:

1. Find its provider and name in the [catalog](CATALOG.md).
2. Add it under `metrics.catalog`, or set `dashmark.metrics=<provider>/<metric>` on a Docker container.
3. Set `source_url` when Dashmark must use a different API address.
4. Set the required inputs and credential environment variables.

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

The catalog lists inputs and credential options. Credentials marked optional
are used only after an anonymous request receives HTTP 401 or 403.

For Docker labels, use `dashmark.metrics_url` for the API address and the
matching `dashmark.metric_*` label for credentials. Docker labels are visible
through Docker APIs. Prefer environment variables or secret files for secrets.

## Service metrics

Service metrics are the Docker, catalog, and local metrics configured for one
card. The `metrics` section accepts these fields:

| Field | Purpose |
| --- | --- |
| `source_url` | HTTP(S) address for catalog metric requests. It replaces `{metrics_url}`. |
| `collection` | Collection frequency and retention. Set `interval` and `retention`, such as `30s`, `15m`, or `14d`. |
| `container` | Docker CPU, memory, and network metrics. Use a list or mapping with optional `visible_to` rules. |
| `charts` | Named charts with a `label`, `unit`, and `style`: `step`, `line`, or `area`. |
| `catalog` | Catalog metrics grouped by provider. A metric can set `inputs`, `overrides`, and `visible_to`. |
| `local` | Metrics defined in this file. Each metric can set `visible_to`. |

```yaml
radarr:
  url: https://radarr.example.com
  metrics:
    source_url: http://radarr:7878
    collection: { interval: 30s, retention: 14d }
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
```

Standalone YAML cards cannot use `container`. Use `visible_to` to restrict one
metric. `METRICS_ACCESS` still restricts all metric data on the server.

## Shared sources

Use `shared_metric_sources` when local metrics on different cards share an HTTP
API address and credentials. Define the connection once, then use its name and
an absolute path in each metric.

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

A shared source requires `base_url` and may define `headers`, `query`, and
`authentication`. A metric can add request-specific `headers`, `query`,
`method`, `form`, or `json`, but cannot replace shared authentication. The path
must begin with `/`.

## Local metrics

Local metrics are custom definitions under `metrics.local`. Use them when no
catalog metric fits your source or extraction needs.

| Mapping | Fields |
| --- | --- |
| `display` | Label and optional chart. |
| `value` | Value kind, unit, rate, transform, and state labels or colors. |
| `source` | Request address, method, request data, authentication, or Socket.IO connection. |
| `extract` | One response reader: `jq`, `prometheus`, `text`, or `for_each`. |

```yaml
radarr:
  metrics:
    local:
      active_downloads:
        display: { label: Active downloads }
        value: { kind: number, unit: count }
        source:
          url: http://radarr:7878/api/v3/queue/status
          headers: { X-Api-Key: { env: RADARR_API_KEY } }
        extract: { jq: .totalRecords }
```

Use `kind: number` with a unit such as `count`, `bytes`, or `seconds` for a
numeric value. Use `kind: state` with `default_color`, and optional `colors`
and `labels`, for a status badge. Use `kind: string` for text. Text has no unit
or history chart. Set `rate: true` on an increasing number to show its
per-second change. The first collection establishes a baseline. `transform`
changes a numeric value after Dashmark reads it.

`jq` reads JSON, `prometheus` reads Prometheus samples, and `text` reads plain
text. `for_each` finds items, requests each item, reads a numeric value, and
combines the results.

Use this form for token authentication:

```yaml
source:
  url: https://service.example.internal/status
  authentication:
    kind: token
    # Try anonymously first, then use this token after HTTP 401 or 403.
    optional: true
    header: Authorization
    prefix: "Bearer "
    value: { env: SERVICE_TOKEN }
```

For HTTP Basic authentication, use `kind: basic` with `username` and
`password`. Token authentication can use a `header` or `query` parameter. For a
cookie session, use `kind: cookie_session` with up to five `requests`. Set
`optional: true` to retry with credentials after HTTP 401 or 403. For Socket.IO,
use `type: socket_io` and a `socket` section.

## Contributing catalog metrics

Catalog metrics are YAML files at `metrics/<provider>/<metric-name>.yml`. They
use the same `display`, `value`, `source`, and `extract` sections as local
metrics. Put provider-wide settings, such as shared headers or chart styles, in
`metrics/<provider>/provider.yml`.

Catalog source URLs normally begin with `{metrics_url}`. Set
`service.metrics.source_url` to that address. Otherwise, Dashmark uses the card
URL when it can. A catalog metric must declare every input. Inputs can be
strings, numbers, or booleans.

`CATALOG.md` is generated from metric definitions. Declare inputs in
`parameters` and credential options using `env`, `file`, or `label` references.
The pre-commit hook regenerates and stages the catalog after catalog YAML
changes. Run `npm run generate:metrics-catalog` to update it manually.
