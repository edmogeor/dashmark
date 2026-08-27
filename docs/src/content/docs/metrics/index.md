---
title: Metrics
description: Add container, library, and custom metrics to Dashmark cards.
---

Metrics are optional. Dashmark can show Docker CPU, memory, and network usage for Docker-backed cards, plus metrics from supported service APIs.

## Metric types

| Type | Best for | Configuration |
| --- | --- | --- |
| Container metrics | CPU, memory, and network usage for a Docker container. | Docker labels or YAML. |
| Library metrics | Values from a supported service API. | Docker labels or YAML. |
| Custom metrics | Values from an API not covered by the library. | YAML. |

Standalone YAML cards support library and custom metrics, but not container metrics.

## Container metrics

Docker-backed cards show CPU, memory, and network usage out of the box. Set `SHOW_METRICS=false` to disable metrics dashboard-wide.

Use `dashmark.metrics` only to choose a different set of container metrics, add library metrics, or disable built-in metrics for one card:

```yaml
labels:
  dashmark.metrics: cpu,memory
```

```yaml
labels:
  dashmark.metrics: none
```

Dashmark collects metrics every 10 seconds by default. Set `METRICS_DATABASE_PATH` to a mounted path such as `/data/metrics.db` to retain metric history when the Dashmark container is replaced.

```yaml
services:
  dashmark:
    volumes:
      - ./data:/data
    environment:
      - METRICS_DATABASE_PATH=/data/metrics.db
```

## Next steps

- [Library metrics](/dashmark/docs/metrics/library/) for supported services.
- [Custom metrics](/dashmark/docs/metrics/custom/) for your own HTTP APIs.
- [Access control](/dashmark/docs/configuration/access-control/) to restrict metric data for specific users.
