---
title: Library metrics
description: Use Dashmark's built-in metric definitions for supported services.
---

Dashmark includes reusable metric definitions for supported services. See the [metric library](https://github.com/edmogeor/dashmark/blob/main/metrics/LIBRARY.md) for available providers, metrics, inputs, and credentials.

## Docker labels

Add a library metric as `provider/metric` in `dashmark.metrics`. Use `dashmark.metrics_source.<provider>` when Dashmark should connect to that provider over a private Docker-network address instead of the card URL.

```yaml
labels:
  dashmark.url: https://radarr.example.com
  dashmark.metrics: cpu,memory,radarr/queue
  dashmark.metrics_source.radarr: http://radarr:7878
```

Library metrics that need credentials use `dashmark.metric_*` labels. Docker labels are visible through Docker APIs and inspect output, so prefer YAML with environment variables or secret files for secrets.

Library inputs and additional providers can be configured per card:

```yaml
labels:
  dashmark.metrics: gatus/uptime
  dashmark.metrics_source.gatus: http://gatus:8080
  dashmark.metrics_input.gatus.uptime.endpoint_key: plex
```

Use `dashmark.metrics_source.<provider>` for a provider-specific API base URL. Use `dashmark.metrics_input.<provider>.<metric>.<input>` for a library input. Replace `/` in the metric key with `.`. A provider with no source label uses the card URL.

## YAML configuration

Add library metric keys under `metrics.entries`. This is the recommended path when a metric needs credentials or must be configured independently of Docker labels.

```yaml
radarr:
  url: https://radarr.example.com
  metrics:
    sources:
      radarr: http://radarr:7878
    entries:
      radarr/queue: {}
```

Some library metrics accept inputs. Refer to the library entry, then set them under `inputs`:

```yaml
office:
  metrics:
    entries:
      homeassistant/entity-state:
        inputs:
          entity_id: sensor.office_temperature
```

## Restrict one metric

Use `visible_to` in YAML to limit an individual metric to matching access entries:

```yaml
radarr:
  metrics:
    entries:
      radarr/queue:
        visible_to: [admins]
```

`METRICS_ACCESS` restricts all metrics server-side. See [Access control](/dashmark/docs/configuration/access-control/) for group and identity configuration.
