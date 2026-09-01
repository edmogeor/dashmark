---
title: Deployment and security
description: Deploy Dashmark safely with or without a reverse proxy.
---

Dashmark can run standalone and serve a local or trusted private network without a reverse proxy. It reads Docker metadata and may receive identity headers from a reverse proxy, so keep both boundaries private and trusted.

## Docker access

Use of a read-only, restricted socket proxy is recommended. Dashmark needs access only to `/version`, `/containers/json`, and `/containers/<id>/stats` for cards and resource usage. Dashmark can connect directly to the Docker socket for a local, trusted setup, but do not expose Docker, the raw socket, or a socket proxy to the public internet.

For remote Docker hosts, run a restricted proxy on each host and connect to it over a private network:

```yaml
environment:
  - DOCKER_HOSTS=home=tcp://home-proxy:2375,vps=tcp://vps-proxy:2375
```

## Reverse proxy (optional)

Use a reverse proxy when publishing Dashmark beyond a trusted network, terminating TLS, or authenticating users for access control. Otherwise, Dashmark can serve directly. Bind it to `127.0.0.1` for host-local access, or a trusted private Docker network. Access control relies on a trusted proxy or authentication provider to establish identity headers.

When using access control, the proxy must remove or overwrite client-supplied identity headers. Otherwise, users could forge a group, username, or email header to see restricted cards or metrics.

### WebSocket upgrades

Live status and metric updates use a same-origin WebSocket at `/api/realtime`. Configure the proxy to forward WebSocket upgrades on that path, including `Upgrade` and `Connection` headers, while preserving the original `Host` and forwarding the browser's `Origin`. Do not route this endpoint as ordinary buffered HTTP.

The WebSocket upgrade must receive the same trusted identity headers as normal Dashmark requests. If `AUTH_TOKEN` is enabled, the proxy must also inject `X-Dashmark-Token` during the upgrade. Browsers cannot attach that custom header to a native WebSocket, so never put the token in browser JavaScript or a query string. Dashmark accepts same-origin upgrades only.

## Process model

Run one long-lived Dashmark process per deployment. Docker discovery, realtime subscriptions, collection state, and SQLite history are local to that process. Multiple replicas are unsupported until shared storage, collector leadership, and realtime pub-sub are available. Scale the host running Dashmark rather than adding application replicas.

## Direct-access token

For an additional shared-secret check, set `AUTH_TOKEN`. Every request must include `X-Dashmark-Token: <token>`.

```bash
openssl rand -hex 32
```

Keep the generated token in your deployment environment or secret store. Do not commit it to Compose files or `config.yml`.

## Next steps

- [Configure access control](/dashmark/docs/configuration/access-control/).
- [Configure remote Docker hosts](/dashmark/docs/configuration/cards/#multiple-docker-hosts).
