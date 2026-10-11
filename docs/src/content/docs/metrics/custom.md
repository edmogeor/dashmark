---
title: Custom metrics
description: Read values and uptime from HTTP APIs or Socket.IO sources.
---

Define custom metrics under a service's `metrics.entries` when no library metric fits. Keys use lowercase letters, numbers, `_`, `-`, and `/`.

```yaml
radarr:
  url: https://radarr.example.com
  metrics:
    entries:
      active_downloads:
        display: { label: Active downloads }
        value: { kind: number, unit: count }
        source:
          url: http://radarr:7878/api/v3/queue/status
          headers: { X-Api-Key: { env: RADARR_API_KEY } }
        extract: { jq: .totalRecords }
```

## Display and value

| Field                          | Purpose                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `display.label`                | Required card label.                                                                                                                        |
| `display.chart`                | Numeric chart: `step` (default, discrete values), `line` (continuous), `area` (filled), `none`, or a chart-group name.                      |
| `value.kind`                   | `number` (default), `string`, `state`, or `uptime`.                                                                                         |
| `value.unit`                   | Numeric unit, default `number`. Examples: `count`, `bytes`, `bytes_per_second`, `percent`, `seconds`, `celsius`, or `{ suffix: requests }`. |
| `value.rate`                   | `true` for increasing counters; shows a per-second rate after the first sample.                                                             |
| `value.transform`              | Numeric adjustment: `{ multiply: 0.001, add: 2 }`; either field may be omitted.                                                             |
| `value.default_color`          | Required for states: `success`, `info`, `warning`, `error`, or `disabled`.                                                                  |
| `value.colors`, `value.labels` | State-value mappings to badge colors and readable labels.                                                                                   |

String and state metrics have no units or history charts. Uptime uses its own history view and requires jq observations with `timestamp`, `status` (`up`, `down`, or `unknown`), and optional `responseTimeMs`. Timestamps may be ISO strings or Unix seconds/milliseconds.

A state metric entry:

```yaml
display: { label: Backup status }
value:
  kind: state
  default_color: disabled
  colors: { healthy: success, failed: error }
  labels: { healthy: Healthy, failed: Failed }
source: { url: http://backup:8080/status }
extract: { jq: .status }
```

## Source and authentication

`source.url` is required: use HTTP(S), `{url}` for the card URL, or `{metric_source}` for `metrics.sources.<key-prefix>`, falling back to the card URL. The prefix is the part before the first `/`, or the whole key when there is no `/`.

| Field                            | Purpose                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `source.method`                  | `GET` (default) or `POST`.                                                                                                                       |
| `source.headers`, `source.query` | Header/query mappings with string, number, boolean, secret, or extracted-token values.                                                           |
| `source.form`, `source.json`     | POST body; choose one. JSON supports nested objects, arrays, scalars, and references. GET cannot have a body.                                    |
| `source.initial.query`           | Uptime bootstrap query when no retained SQLite history exists; later polls use `source.query`. Background recovery uses regular queries instead. |
| `source.authentication`          | `basic`, `token`, or `cookie_session` login flow.                                                                                                |
| `source.type`, `source.socket`   | Use `type: socket_io`; `socket` contains `path`, `auth`, optional `login: {event, args}`, and required `request: {event, args}`.                 |
| `source.use`, `source.path`      | Reuse a `shared_metric_sources` entry with a path beginning with `/`.                                                                            |

Secrets use `{ env: VARIABLE }`, `{ file: /path/to/secret }`, or `{ label: dashmark.metric_api_key }` for Docker labels. Extracted tokens use `{ token: name, prefix: 'Bearer ' }`. Keep credentials out of literal config values.

Token authentication requires one `header` or `query` target, a secret `value`, and optional `prefix`/`suffix`:

```yaml
source:
  url: '{url}/status'
  authentication:
    kind: token
    header: Authorization
    prefix: 'Bearer '
    value: { env: SERVICE_TOKEN }
```

Basic authentication uses `username`/`password` secret references. Cookie sessions use `requests` with HTTP request fields and optional token `extract` mappings (`jq` or `cheerio`). Set `optional: true` for anonymous-first requests that retry with credentials after HTTP 401/403.

## Extraction

Choose exactly one extractor:

| Field                | Purpose                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `extract.jq`         | Extract a value or uptime observations from JSON.                                                                   |
| `extract.prometheus` | Select a series by `name` and optional `labels`; use `reduce` for numbers or `value_label` for string/state values. |
| `extract.text`       | `true` to use the complete plain-text response.                                                                     |
| `extract.for_each`   | Numeric HTTP metrics: `items` jq, `request.url` containing `{item}`, `value` jq, and `reduce`.                      |

Reductions are `count`, `sum`, `average`, `minimum`, or `maximum`:

```yaml
extract:
  prometheus: { name: http_requests_total, labels: { method: GET }, reduce: sum }
```

With jq, `extract.pagination` defines `items` and `next` expressions. The metric's jq receives `{items: [...]}`; `next` returns a page number or `null`/`0` to finish. `page_parameter` defaults to `page`. Use `initial_only: true` to paginate only an uptime bootstrap.

## Uptime recovery

Historical recovery is disabled by default. Set the environment variable `ENABLE_METRIC_BACKFILL=true` to enable it; normal current-page collection continues when disabled, and saved checkpoints are preserved.

HTTP history sources can set `extract.pagination.recover: true` to recover gaps and initial history gradually when backfill is enabled. Pages must be newest-first and observations immutable; records within a page may be in either order. `$page` is the current page number. Do not combine `recover` with `initial_only`.

```yaml
display: { label: Uptime }
value: { kind: uptime }
source: { url: '{metric_source}/history', query: { pageSize: 500 } }
extract:
  pagination:
    recover: true
    items: .results
    next: 'if (.results | length) == 500 then $page + 1 else null end'
  jq: '[.items[] | {timestamp, status: (if .success then "up" else "down" end)}]'
```

- Configure the provider's page-size query parameter yourself. Batches are limited to **500 observations** and individual HTTP responses to **1 MiB**.
- The shared queue processes one batch globally after current collection, with no fixed delay after successful pages. It saves directly to SQLite; **4 KiB** checkpoints survive restarts. Failures back off up to five minutes, and stalled recovery pauses.
- Open tooltips prioritize their visible metrics; an uptime modal prioritizes its selected metric. Priority uses individual requests and ends when the view closes or disconnects. Other jobs then resume background recovery. Hover prefetch alone does not receive priority.
- Recovery stops at stored-history overlap, retention, or upstream exhaustion. Closing views does not cancel it. Saved charts stay visible with a loading/error indicator; updates follow normal polling and chart calculations require active subscribers.
- Unrecoverable gaps remain unknown. Docker stats and current-value endpoints cannot supply missed history.

### Shared bulk history

Providers with a numbered bulk endpoint can opt into `extract.pagination.bulk`. The endpoint must use the same page-number parameter as individual history, consecutive pages starting at 1, and a configurable page-size parameter. Each full page must contain that many observations per endpoint; shorter pages indicate exhaustion.

```yaml
extract:
  pagination:
    recover: true
    items: .results
    next: 'if (.results | length) == 500 then $page + 1 else null end'
    bulk:
      url: '{metric_source}/all-history'
      key: '{endpoint}'
      page_size_parameter: pageSize
      jq: 'map({key: .id, value: [.results[] | {timestamp, status}]}) | from_entries'
  jq: '[.items[] | {timestamp, status}]'
```

Declare `endpoint` in `parameters` and set `source.query.pageSize: 500`. Bulk URLs resolve like ordinary source URLs; keys substitute provider-transformed parameter values without URL encoding. The bulk jq expression receives the JSON response and `$pageSize`, and must return a mapping from endpoint keys to canonical uptime observations (`timestamp`, `status`, optional `responseTimeMs`). Credentials and other request settings are inherited from the individual source.

Bulk responses are limited to **4 MiB**. An oversized response halves the requested size when divisible by two, fetching the smaller pages needed to cover the same logical page without changing saved offsets. Invalid, unavailable, or still-oversized bulk responses fall back to individual recovery. Matching metrics reuse the extracted page, with one cached page per source, at most four sources, and a 60-second reuse window. Request settings and credentials isolate caches; each metric retains its own persistent recovery checkpoint. Gatus opts into this through its library definition; other providers can use the same metadata.

Socket.IO uptime uses the same observation validation, with a dedicated Node WebSocket, a **1 MiB frame limit**, at most **500 observations per acknowledgement**, and no automatic reconnection. Other history protocols use their own fetchers; see [history adapters](/dashmark/docs/metrics/contributing/#history-adapters).

## Chart groups

Define groups under `metrics.charts` and reference their names in `display.chart`. Members must share a unit and visible chart style (`step`, `line`, or `area`).

```yaml
service:
  url: https://service.example.com
  metrics:
    charts:
      throughput: { unit: bytes_per_second, style: area }
    entries:
      download:
        display: { label: Download, chart: throughput }
        source: { url: '{url}/stats' }
        extract: { jq: .download_bytes_per_second }
      upload:
        display: { label: Upload, chart: throughput }
        source: { url: '{url}/stats' }
        extract: { jq: .upload_bytes_per_second }
```

## Shared API connections

Use `shared_metric_sources` for cards sharing a base URL and credentials. Each metric supplies its own `/`-prefixed path and extractor:

```yaml
shared_metric_sources:
  home_assistant:
    base_url: http://homeassistant:8123
    authentication: { kind: token, header: Authorization, prefix: 'Bearer ', value: { env: HOME_ASSISTANT_TOKEN } }

office:
  url: https://homeassistant.example.com
  metrics:
    entries:
      temperature:
        display: { label: Office temperature }
        value: { unit: celsius }
        source: { use: home_assistant, path: /api/states/sensor.office_temperature }
        extract: { jq: '.state | tonumber' }
```
