---
title: Custom metrics
description: Read values from an HTTP API when no library metric fits.
---

Custom metrics live under a service's `metrics.entries` mapping. Use them when your service has an HTTP API but no matching metric library definition.

## Build a custom metric

Start with a numeric metric. This example reads the number of active downloads from Radarr's API. Store the API key in an environment variable rather than in `config.yml`.

```yaml
radarr:
  url: https://radarr.example.com
  metrics:
    entries:
      active_downloads:
        display:
          label: Active downloads
        value:
          kind: number
          unit: count
        source:
          url: http://radarr:7878/api/v3/queue/status
          headers:
            X-Api-Key: { env: RADARR_API_KEY }
        extract:
          jq: .totalRecords
```

### 1. Name the metric

The key under `metrics.entries` is the metric name. Use lowercase letters, numbers, `_`, `-`, and `/`. The example uses `active_downloads`.

### 2. Set the display

| Option          | Required | Purpose                                                                        |
| --------------- | -------- | ------------------------------------------------------------------------------ |
| `display.label` | Yes      | Text shown on the card.                                                        |
| `display.chart` | No       | A graph type (`step`, `line`, `area`, or `none`) or the name of a chart group. |

### 3. Define the value

| Option                | Required        | Purpose                                                                                                                                  |
| --------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `value.kind`          | No              | `number` (default), `string`, or `state`.                                                                                                |
| `value.unit`          | Numeric metrics | Unit such as `count`, `bytes`, `bytes_per_second`, `percent`, `seconds`, or `celsius`. A custom suffix can use `{ suffix: "requests" }`. |
| `value.rate`          | No              | Set to `true` for an increasing counter. Dashmark shows the per-second rate after the first sample.                                      |
| `value.transform`     | No              | Change a numeric value after extraction with `multiply` and/or `add`.                                                                    |
| `value.default_color` | State metrics   | Default state badge color: `success`, `info`, `warning`, `error`, or `disabled`.                                                         |
| `value.colors`        | No              | Map response values to state badge colors.                                                                                               |
| `value.labels`        | No              | Map response values to readable labels.                                                                                                  |

`string` and `state` metrics do not have units or history charts. State metrics require `value.default_color`.

```yaml
value:
  kind: number
  unit: bytes
  rate: true
  transform: { multiply: 0.001 }
```

### 4. Request the source

`source.url` is required. It must be an HTTP(S) URL, or begin with `{url}` or `{metric_source}`. Use the card URL for `{url}`. For `{metric_source}`, configure `metrics.sources.<metric-name>` with a private API address.

| Option                  | Purpose                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `source.method`         | `GET` (default) or `POST`.                                                                                                    |
| `source.headers`        | Request headers. Values can be strings, numbers, booleans, or `{ env: VARIABLE }` and `{ file: /path/to/secret }` references. |
| `source.query`          | Query-string parameters, using the same values as `headers`.                                                                  |
| `source.initial.query`  | Query-string parameters used only for the initial collection, before subsequent polls use `source.query`.                     |
| `source.form`           | Form body for a `POST` request.                                                                                               |
| `source.json`           | JSON body for a `POST` request. Values can be nested objects, arrays, scalars, or secret references.                          |
| `source.authentication` | A `basic`, `token`, or `cookie_session` login flow.                                                                           |
| `source.type`           | Set to `socket_io` for a Socket.IO source.                                                                                    |
| `source.socket`         | Socket.IO path, auth, optional login event, and required request event.                                                       |
| `source.use`            | Name of a top-level `shared_metric_sources` entry to reuse its base URL and authentication.                                   |
| `source.path`           | Required path beginning with `/` when using `source.use`.                                                                     |

Use one body type per request: `form` or `json`. `GET` requests cannot have a body.

Use `source.initial.query` for history sources that need an initial backfill followed by lightweight incremental requests. Dashmark stores uptime observations per card and metric in its metrics SQLite database, so the initial request runs only when no retained history exists.

For token authentication, use a header or query parameter and a secret reference:

```yaml
source:
  url: http://service:8080/status
  authentication:
    kind: token
    header: Authorization
    prefix: 'Bearer '
    value: { env: SERVICE_TOKEN }
```

### 5. Extract the value

Define exactly one of these extractors:

| Option               | Response type and purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `extract.jq`         | Reads one value from a JSON response.                                                             |
| `extract.prometheus` | Reads a Prometheus sample by metric name, with optional labels, reduction, and value label.       |
| `extract.text`       | Uses the complete plain-text response.                                                            |
| `extract.for_each`   | For numeric HTTP metrics, requests each discovered item and combines the values with a reduction. |

`extract.pagination` is available with `jq`. It defines `items` and `next` jq expressions so Dashmark can collect JSON pages before it runs the metric's `jq` expression.

```yaml
extract:
  prometheus:
    name: http_requests_total
    labels: { method: GET }
    reduce: sum
```

## Charts and chart groups

Numeric metrics can show a history graph. Set `display.chart` to one of these graph types:

| Type   | Use it for                                                         |
| ------ | ------------------------------------------------------------------ |
| `step` | Values that change in discrete steps, such as queue size.          |
| `line` | Continuous values, such as a temperature.                          |
| `area` | Values where a filled graph is easier to read, such as throughput. |
| `none` | A current value without a history graph.                           |

Use a named chart group when several metrics should share one graph. Define the group under `metrics.charts`, then reference its name in each metric's `display.chart`. Metrics in the same group must use the same graph type and unit.

```yaml
service:
  metrics:
    charts:
      throughput:
        label: Network throughput
        unit: bytes_per_second
        style: area
    entries:
      download_rate:
        display: { label: Download, chart: throughput }
        value: { kind: number, unit: bytes_per_second }
        source: { url: http://service:8080/metrics }
        extract: { jq: .download_bytes_per_second }
      upload_rate:
        display: { label: Upload, chart: throughput }
        value: { kind: number, unit: bytes_per_second }
        source: { url: http://service:8080/metrics }
        extract: { jq: .upload_bytes_per_second }
```

## Add a state metric

Use a state metric for a status badge. It needs a default color, and can map response values to specific labels and colors.

```yaml
backup:
  metrics:
    entries:
      health:
        display:
          label: Backup status
        value:
          kind: state
          default_color: disabled
          colors:
            healthy: success
            failed: error
          labels:
            healthy: Healthy
            failed: Failed
        source:
          url: http://backup:8080/status
        extract:
          jq: .status
```

## Reuse an API connection

Use `shared_metric_sources` when multiple cards connect to the same API with the same credentials:

```yaml
shared_metric_sources:
  home_assistant:
    base_url: http://homeassistant:8123
    authentication:
      kind: token
      header: Authorization
      prefix: 'Bearer '
      value: { env: HOME_ASSISTANT_TOKEN }

office:
  metrics:
    entries:
      temperature:
        display: { label: Office temperature }
        value: { kind: number, unit: celsius }
        source:
          use: home_assistant
          path: /api/states/sensor.office_temperature
        extract: { jq: '.state | tonumber' }
```

The shared source holds the base URL and authentication. Each metric supplies a path beginning with `/` and its own extractor.
