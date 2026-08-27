---
title: Quick start
description: Run Dashmark and add your first Docker service card.
---

## 1. Create the Compose file

Create `docker-compose.yml` with Dashmark and a read-only Docker socket proxy. The proxy exposes only the Docker endpoints Dashmark needs. If you prefer standard Docker commands, see [Use Docker commands](#use-docker-commands).

```yaml
services:
  dashmark:
    image: ghcr.io/edmogeor/dashmark:latest
    ports:
      - "127.0.0.1:4321:4321"
    volumes:
      - ./data:/data
    environment:
      - DOCKER_HOSTS=tcp://dockerproxy:2375
    depends_on:
      - dockerproxy
    restart: unless-stopped

  dockerproxy:
    image: wollomatic/socket-proxy:1
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges]
    command:
      - -allowfrom=dashmark
      - -allowGET=/version
      - -allowGET=/v1\\..{1,2}/containers/json
      - -allowGET=/v1\\..{1,2}/containers/.*/stats
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

Do not expose the Docker socket or socket proxy to the public internet.

## 2. Add a card label

Add at least one `dashmark.*` label to the Docker service. Set `dashmark.url` unless Dashmark can infer the URL from a supported Traefik `Host(...)` rule.

```yaml
services:
  plex:
    image: plexinc/pms-docker
    labels:
      dashmark.url: https://plex.example.com
      dashmark.title: Plex
      dashmark.category: Media
```

## 3. Start the stack

```bash
docker compose up -d
```

Open Dashmark at `http://<server-address>:4321`, or at the domain configured by your reverse proxy. Recreate a service after changing its labels:

```bash
docker compose up -d --force-recreate plex
```

## Use Docker commands

Create a private Docker network, then start the restricted socket proxy:

```bash
docker network create dashmark

docker run -d \
  --name dockerproxy \
  --network dashmark \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --volume /var/run/docker.sock:/var/run/docker.sock:ro \
  wollomatic/socket-proxy:1 \
  -allowfrom=dashmark \
  -allowGET=/version \
  '-allowGET=/v1\\..{1,2}/containers/json' \
  '-allowGET=/v1\\..{1,2}/containers/.*/stats'
```

Start Dashmark on the same network. Replace `<bind-address>` with a host IP such as `127.0.0.1`, or omit the address and publish `4321:4321` to listen on every interface.

```bash
docker run -d \
  --name dashmark \
  --network dashmark \
  --publish <bind-address>:4321:4321 \
  --volume "$PWD/data:/data" \
  --env DOCKER_HOSTS=tcp://dockerproxy:2375 \
  ghcr.io/edmogeor/dashmark:latest
```

Start a service card with Docker labels:

```bash
docker run -d \
  --name plex \
  --label dashmark.url=https://plex.example.com \
  --label dashmark.title=Plex \
  --label dashmark.category=Media \
  plexinc/pms-docker
```

Container labels are set when a container is created. Remove and run the service again after changing its labels.

## Next steps

- [Configure card labels](/dashmark/docs/configuration/cards/)
- [Override cards with YAML](/dashmark/docs/configuration/yaml/)
- [Set dashboard-wide options](/dashmark/docs/configuration/settings/)
