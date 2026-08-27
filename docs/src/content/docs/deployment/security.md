---
title: Deployment and security
description: Deploy Dashmark safely behind a reverse proxy.
---

Dashmark reads Docker metadata and may receive identity headers from a reverse proxy. Keep both boundaries private and trusted.

## Docker access

Use a read-only, restricted socket proxy. Dashmark needs access only to `/version`, `/containers/json`, and `/containers/<id>/stats` for cards and resource usage. Do not mount the raw Docker socket into Dashmark or expose Docker and the socket proxy to the public internet.

For remote Docker hosts, run a restricted proxy on each host and connect to it over a private network:

```yaml
environment:
  - DOCKER_HOSTS=home=tcp://home-proxy:2375,vps=tcp://vps-proxy:2375
```

## Reverse proxy

Bind Dashmark to `127.0.0.1` or a private Docker network, then publish it through a reverse proxy. Authenticate users at that proxy before enabling access control.

The proxy must remove or overwrite client-supplied identity headers. Otherwise, users could forge a group, username, or email header to see restricted cards or metrics.

## Direct-access token

For an additional shared-secret check, set `AUTH_TOKEN`. Every request must include `X-Dashmark-Token: <token>`.

```bash
openssl rand -hex 32
```

Keep the generated token in your deployment environment or secret store. Do not commit it to Compose files or `config.yml`.

## Next steps

- [Configure access control](/dashmark/docs/configuration/access-control/).
- [Configure remote Docker hosts](/dashmark/docs/configuration/cards/#multiple-docker-hosts).
