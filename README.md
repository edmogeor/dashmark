<div align="center">
  <img src="public/brand/icon.svg" width="140" alt="Dashmark logo"/>
  <h1>Dashmark</h1>
  <p>A lightweight dashboard for links to your Docker services.</p>
  <p>
    <a href="https://github.com/edmogeor/dashmark/actions/workflows/ci.yml">
      <img src="https://github.com/edmogeor/dashmark/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"/>
    </a>
    <a href="https://github.com/fallow-rs/fallow">
      <img src="https://raw.githubusercontent.com/edmogeor/dashmark/badges/badge.svg" alt="fallow health"/>
    </a>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"/>
    </a>
  </p>
</div>

Dashmark discovers labeled Docker containers and turns them into dashboard cards. Use `dashmark.*` labels to set each card's link, title, icon, category, and access. It is a small astro based self-hosted Node.js service with no database.

![Dashmark dashboard](assets/screenshot.png)

<p align="center">
  <a href="https://edmogeor.github.io/dashmark/demo/">View the live demo</a>
</p>

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Security](#security)
- [Development](#development)
- [Donations](#donations)
- [AI assistance](#ai-assistance)
- [License](#license)

## Features

- Discover Docker containers across multiple hosts.
- Discover Docker containers through opt-in labels.
- Reuse Traefik host rules as card links.
- Organise cards with categories, search aliases, and custom ordering.
- Show live container state and health, refreshed every 30 seconds.
- View live CPU, memory, and network usage for each container.
- Use automatic, selfhst, remote, local, or placeholder icons.
- Add automatic service descriptions from the selfh.st app directory.
- Add standalone cards and label overrides with YAML.
- Limit card visibility with groups supplied by your authentication proxy.
- Add a small custom stylesheet without modifying the image.

## Quick start

**You need:** Docker Compose and access to the Docker socket. The example uses a socket proxy so Dashmark does not receive the raw socket.

1. Create `docker-compose.yml`:

   ```yaml
   services:
      dashmark:
        image: ghcr.io/edmogeor/dashmark:latest
        ports:
          - "127.0.0.1:4321:4321"
        volumes:
          - ./data:/data
       environment:
          - DOCKER_HOSTS=default=tcp://dockerproxy:2375
       depends_on:
         - dockerproxy
       restart: unless-stopped

     dockerproxy:
       image: wollomatic/socket-proxy:1
       read_only: true
       cap_drop:
         - ALL
       security_opt:
         - no-new-privileges
       command:
         - "-loglevel=info"
         - "-listenip=0.0.0.0"
         - "-allowfrom=dashmark"
         - "-allowGET=/version"
         - "-allowGET=/v1\\..{1,2}/containers/.*"
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock:ro
   ```

2. Add a card label to a service in the same Compose project:

   ```yaml
   services:
     plex:
       image: plexinc/pms-docker
       labels:
         - "dashmark.url=https://plex.example.com"
         - "dashmark.title=Plex"
         - "dashmark.category=Media"
   ```

3. Start the services:

   ```bash
   docker compose up -d
   ```

4. Open <http://localhost:4321>.

Dashmark shows a card for each eligible container. After changing labels, recreate the affected container with `docker compose up -d`.

For an annotated Compose file with every option, see [`docker-compose.yml`](docker-compose.yml).

## How it works

Dashmark reads container metadata through the Docker API. A container appears when it has a `dashmark.*` label and a link from `dashmark.url`, a matching YAML entry, or a supported Traefik host rule. Containers with only Traefik labels do not appear.

Dashmark polls for container state and health every 30 seconds by default. Set `STATUS_POLL_INTERVAL` to change the interval in seconds. A YAML entry can override a container's labels or create a standalone card for a service outside Docker.

## Configuration

Configure Dashmark with environment variables, Docker labels, and an optional YAML file. YAML settings override environment variables, and YAML card fields override Docker labels.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOCKER_HOSTS` | `unix:///var/run/docker.sock` | One Docker endpoint, or comma-separated named endpoints such as `home=tcp://home-proxy:2375,vps=tcp://vps-proxy:2375` |
| `CONFIG_FILE` | `/data/config.yml` | YAML configuration file path, environment-only |
| `ICONS_DIR` | `/data/icons` | Directory for local icon files |
| `PORT` | `4321` | HTTP listening port, overridden by YAML `port` when configured |
| `CUSTOM_STYLESHEET` | unset | Absolute path to a mounted CSS file, such as `/data/custom.css`, served as `/custom.css` |
| `ENABLE_ACCESS_CONTROL` | `false` | Filter cards using authenticated access entries |
| `ACCESS_GROUPS_HEADER` | `auto` | Groups header name, or automatic provider detection |
| `SHOW_HEADER` | `true` | Show the greeting header |
| `SHOW_GROUP_TAGS` | `true` | Show the user's relevant access or status-badge group tags |
| `SHOW_THEME_TOGGLE` | `true` | Show the light and dark theme toggle |
| `CUSTOM_HEADER` | unset | Greeting template using the tags below |
| `USER_NAME_HEADER` | `auto` | Header for `{full_name}` |
| `USER_FIRST_NAME_HEADER` | `auto` | Header for `{first_name}` |
| `USER_LAST_NAME_HEADER` | `auto` | Header for `{last_name}` |
| `USER_USERNAME_HEADER` | `auto` | Header for `{username}` |
| `USER_EMAIL_HEADER` | `auto` | Header for `{email}` |
| `GREETING_MORNING` | `Good morning` | Morning value for `{greeting}` |
| `GREETING_AFTERNOON` | `Good afternoon` | Afternoon value for `{greeting}` |
| `GREETING_EVENING` | `Good evening` | Evening value for `{greeting}` |
| `SHOW_SEARCH` | `true` | Show search and the category filter |
| `SHOW_STATUS` | `true` | Show container state and health badges |
| `STATUS_BADGE_ACCESS` | unset | Comma-separated access entries allowed to see status badges; unset shows them to everyone |
| `SHOW_METRICS` | `true` | Fetch and show container and custom metrics |
| `METRICS_ACCESS` | unset | Comma-separated access entries allowed to receive metrics; unset shows them to everyone |
| `METRICS_DATABASE_PATH` | `/tmp/dashmark/metrics.db` in production | SQLite database used for resource metric history. The default is in the container filesystem and is lost on restart. Set a mounted path explicitly to retain history. Development uses `.astro/metrics.db` by default |
| `METRICS_POLL_INTERVAL` | `2` | Seconds between background metric samples; card overrides may use a longer interval |
| `METRICS_HISTORY_PERIOD` | `300` | Seconds of resource metric history displayed in live tickers |
| `STATUS_POLL_INTERVAL` | `30` | Seconds between container status updates |
| `CATEGORY_ORDER` | unset | Comma-separated category order; unlisted categories follow alphabetically |
| `ENABLE_AUTOMATIC_DESCRIPTIONS` | `true` | Match selfh.st descriptions when no description is set |
| `ENABLE_AUTOMATIC_ICONS` | `true` | Guess icons from image names when no icon is set |
| `SHOW_BRANDING` | `true` | Show the Dashmark logo near search |
| `NEW_TAB` | `false` | Open card links in a new tab |
| `AUTH_TOKEN` | unset | Require `X-Dashmark-Token: <token>` on every request; overridden by YAML `auth_token` when configured |

### Multiple Docker hosts

Use `DOCKER_HOSTS` to discover containers from more than one Docker daemon:

```yaml
environment:
  - DOCKER_HOSTS=home=tcp://home-proxy:2375,vps=tcp://vps-proxy:2375
```

For one host, provide its Docker endpoint directly and Dashmark assigns it the `default` host ID:

```yaml
environment:
  - DOCKER_HOSTS=tcp://dockerproxy:2375
```

For multiple hosts, use a comma-separated list of `<host-id>=<Docker endpoint>` entries. Host IDs may contain letters, numbers, `_`, and `-`; they identify a host in YAML overrides and must be unique. When unset, Dashmark connects to `unix:///var/run/docker.sock` as the `default` host.

> **Breaking change:** `DOCKER_HOST` is no longer read. Replace `DOCKER_HOST=tcp://dockerproxy:2375` with `DOCKER_HOSTS=tcp://dockerproxy:2375` when upgrading.

Dashmark fetches hosts independently. Cards from reachable hosts still appear if another host is unavailable. Docker cards show their host ID when multiple Docker hosts are configured. The implicit `default` host is displayed as `host`; name a Docker host in `DOCKER_HOSTS` to use another label. Internal IDs and status updates remain namespaced by host so identical container IDs do not collide.

Run a restricted socket proxy on every remote Docker host and connect to it over a private network such as Tailscale or WireGuard. Do not expose the Docker daemon or a socket proxy on the public internet. Dashmark only needs read access to `/version`, `/containers/json`, and each container's `/stats` endpoint.

### Docker labels

Add labels to opt a container in and configure its card.

| Label | Purpose |
| --- | --- |
| `dashmark.hidden` | Set to `true` to hide the container |
| `dashmark.url` | Card link. May be inferred from a Traefik rule |
| `dashmark.metrics_url` | Optional private HTTP(S) API base for catalog metric sources; defaults to the card link URL |
| `dashmark.title` | Display title. Defaults to the container name |
| `dashmark.description` | Tooltip text; set to `none` to suppress automatic descriptions |
| `dashmark.icon` | `selfhst:<slug>`, an image URL, a path in `ICONS_DIR`, or `placeholder` |
| `dashmark.category` | Category name; matching is case-insensitive |
| `dashmark.show_status` | Set to `false` to hide the status badge and resource-usage tooltip for this card |
| `dashmark.metrics` | Comma-separated built-in metrics (`cpu`, `memory`, `network`) and catalog metric keys (`provider/metric`); set to `none` to disable built-in metrics |
| `dashmark.metric_api_key` | Optional literal API-key override for catalog metrics. Docker labels are visible to Docker APIs and inspect output. |
| `dashmark.metric_api_secret` | Optional literal API-secret override for HTTP Basic catalog metrics. Docker labels are visible to Docker APIs and inspect output. |
| `dashmark.metric_username` | Optional literal username override for authenticated catalog metrics. |
| `dashmark.metric_password` | Optional literal password override for authenticated catalog metrics. |
| `dashmark.metrics_access.<metric>` | Comma-separated access entries for one metric; use `.` in place of `/` in custom metric keys |
| `dashmark.access` | Comma-separated access allow-list |
| `dashmark.search_aliases` | Comma-separated additional search terms |
| `dashmark.order` | Sort order within a category, lower values first; cards without an order follow alphabetically by title |

`CATEGORY_ORDER=Media,Productivity,Home` sets the display order for listed categories. Category names are matched case-insensitively; configured names set their display spelling, while unlisted categories use the first spelling found after cards are sorted. Uncategorized cards always appear last.

### Metrics

Dashmark can collect Docker CPU, memory, and network usage, along with catalog
and custom service metrics. Catalog metrics are opt-in: select each with
`dashmark.metrics=provider/metric` or `service.metrics.catalog`. Set
`SHOW_METRICS=false` to disable collection.
Set `METRICS_ACCESS=admins,operators` to restrict metric values and history to
matching users.

Docker-backed cards can use `dashmark.metrics` for built-in container metrics.
YAML-only cards support catalog and local metrics, but not Docker usage metrics.
Metrics history is stored in SQLite; set `METRICS_DATABASE_PATH` to a mounted
path when it must survive container replacement.

```yaml
labels:
  dashmark.metrics: cpu,memory,radarr/queue
  dashmark.metrics_url: http://radarr:7878
```

```yaml
radarr:
  metrics:
    source_url: http://radarr:7878
    collection: { interval: 30s, retention: 14d }
    container: [cpu, memory, network]
    charts:
      queue: { label: Queue, unit: count, style: line }
    catalog:
      radarr:
        queue: { visible_to: media }
```

All YAML metric settings live under `service.metrics`. See [Metrics](metrics/README.md)
for catalog selection, local metrics, collection options, and the full schema.

When `dashmark.url` is absent, Dashmark can derive an HTTPS URL from a Traefik router label such as `traefik.http.routers.plex.rule=Host(\`plex.example.com\`)`. Add another `dashmark.*` label to opt the container in.

### YAML configuration

Mount one host directory at `/data`. Dashmark reads an optional YAML file from `/data/config.yml`, local icons from `/data/icons`, and an optional stylesheet from `/data/custom.css`. Use the reserved top-level `settings` mapping for dashboard settings and top-level service keys for cards. YAML settings override environment variables, matching YAML card precedence over Docker labels. Set `CONFIG_FILE`, `ICONS_DIR`, or `CUSTOM_STYLESHEET` only when using another layout.

Every YAML field that accepts a list supports a YAML list, one scalar value, or a comma-separated scalar. For example, these are equivalent: `access: [admins, operators]`, `access: admins`, and `access: admins, operators`.

Dashmark rejects unknown keys and invalid values rather than silently falling back to defaults. The dashboard error identifies the invalid field path, such as `settings.enable_access_control must be a boolean`.

`CONFIG_FILE` remains environment-only because Dashmark needs it before it can load its YAML file. `port` overrides `PORT` when present. `auth_token` accepts exactly one `{ env: VARIABLE_NAME }` or `{ file: /path/to/secret }` reference, never a literal value; it overrides `AUTH_TOKEN`. `docker_hosts` accepts the same endpoint format as `DOCKER_HOSTS` and may use a YAML list; access settings and `category_order` are YAML lists. Metric collection durations belong in `service.metrics.collection`.

```yaml
settings:
  port: 4321
  docker_hosts: home=tcp://dockerproxy:2375
  enable_access_control: true
  access_groups_header: X-Forwarded-Groups
  show_search: false
  status_badge_access: [admins, operators]
  category_order: [Media, Home]
  auth_token: { file: /run/secrets/dashmark_auth_token }

plex:
  title: Plex
  url: https://plex.example.com
```

Available settings are `port`, `docker_hosts`, `icons_dir`, `custom_stylesheet`, `enable_access_control`, `access_groups_header`, `user_name_header`, `user_username_header`, `user_email_header`, `user_first_name_header`, `user_last_name_header`, `show_header`, `show_group_tags`, `show_theme_toggle`, `custom_header`, `greeting_morning`, `greeting_afternoon`, `greeting_evening`, `auth_token`, `show_search`, `show_status`, `status_badge_access`, `show_metrics`, `metrics_database_path`, `status_poll_interval`, `category_order`, `enable_automatic_descriptions`, `enable_automatic_icons`, `show_branding`, and `new_tab`.

Each top-level service key is a container name or Compose service name. A matching key overrides that container; a non-matching key creates a standalone card and must include `url`.

With `DOCKER_HOSTS`, use `<host-id>/<container-or-service-name>` to target a container on one host. Dashmark resolves YAML overrides in this order:

1. Host-qualified container name, for example `vps/plex` for a container named `plex` on `vps`.
2. Host-qualified Compose service name, for example `vps/plex` for `com.docker.compose.service=plex` on `vps`.
3. Unqualified container name, for example `plex` on any host.
4. Unqualified Compose service name, for example `plex` on any host.

An unqualified key is a shared override. A host-qualified key overrides it for that host only. Container names take precedence over Compose service names at the same level.

```yaml
plex:
  title: Plex
  url: https://plex.example.com
  icon: selfhst:plex
  category: Media
  order: 1
  search_aliases:
    - movies
  access:
    - media

github:
  title: GitHub
  url: https://github.com
  category: External

# Override only the plex service discovered from the `vps` Docker host.
vps/plex:
  title: VPS Plex
```

For the same service on multiple hosts, configure a shared default and one override per host:

```yaml
# Applies to Plex everywhere unless a host-specific key overrides a field.
plex:
  category: Media
  icon: selfhst:plex

home/plex:
  title: Home Plex
  url: https://plex.home.example.com

vps/plex:
  title: VPS Plex
  url: https://plex.vps.example.com
```

Available card fields are `title`, `description`, `url`, `icon`, `category`, `host`, `order`, `hidden`, `show_status`, `metrics`, `access`, and `search_aliases`. `host` adds a host badge to a standalone YAML card. It also makes Docker cards show their host badges. Cards with the same host value share its badge color; YAML anchors can reuse a host value. `metrics` is the canonical metric mapping described above. The retired YAML keys `metrics` list, `metric_providers`, `metrics_url`, `metric_parameters`, `metrics_poll_interval`, `metrics_history_period`, `metrics_access`, and `custom_metrics` are removed with no aliases. See [`data/config.yml`](data/config.yml) for a commented example.

### Icons

Dashmark resolves icons in this order:

1. `placeholder` shows title initials and disables guessing for that card.
2. An `http` or `https` URL is used directly.
3. `selfhst:<slug>` selects an icon from the bundled [selfhst](https://selfh.st/) index.
4. Any other value is a path inside `ICONS_DIR`, including subdirectories.
5. With no icon value, Dashmark guesses from the container image name.
6. If no icon is found, Dashmark shows initials.

### Descriptions

When `ENABLE_AUTOMATIC_DESCRIPTIONS` is enabled, Dashmark matches cards without a description against its bundled [selfh.st app directory](https://selfh.st/apps/) index. A `dashmark.description` label or YAML `description` takes precedence; set either to `none` to suppress automatic descriptions. The generated index is derived from [selfhst/cdn](https://github.com/selfhst/cdn) under the [MIT License](https://github.com/selfhst/cdn/blob/main/LICENSE); see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

### Styling

Mount a stylesheet and set `CUSTOM_STYLESHEET` to its absolute container path. Dashmark loads it after its built-in CSS. Use the semantic `dashmark-*` classes rather than Tailwind utilities or DOM position.

```yaml
services:
  dashmark:
    volumes:
      - ./data:/data
    environment:
      - CUSTOM_STYLESHEET=/data/custom.css
```

[`config/custom.css.example`](config/custom.css.example) lists every supported styling class.

### Access groups and greetings

Set `ENABLE_ACCESS_CONTROL=true` to show a card only when one of its `access` entries matches an authenticated group, username, or email. Cards with no access entries remain visible to everyone. Dashmark returns an error when the groups header is missing. Matching is case-insensitive.

`ACCESS_GROUPS_HEADER=auto` checks these headers in order: Authentik (`X-Authentik-Groups`), Authelia (`Remote-Groups`), oauth2-proxy (`X-Forwarded-Groups` or `X-Auth-Request-Groups`), and Keycloak Gatekeeper (`X-Auth-Groups`). Set the variable to a header name for another proxy. Group values may be comma-, semicolon-, or pipe-separated, or a JSON array.

Set `STATUS_BADGE_ACCESS=admins,operators` to show status badges only to matching users. The comparison is case-insensitive; leaving it unset shows badges to everyone.

When group tags are enabled, Dashmark shows only the user's authenticated groups that are referenced by a visible card's `access` entries.

The default header greets the authenticated user. Use `CUSTOM_HEADER`, for example `CUSTOM_HEADER={greeting}, {first_name}!`, to customise it. The available tags are `{greeting}`, `{full_name}`, `{first_name}`, `{last_name}`, `{username}`, and `{email}`. Set the corresponding `USER_*_HEADER` variables when automatic detection does not support your proxy.

## Security

- Do not mount the raw Docker socket into Dashmark. Use a socket proxy with read-only, filtered Docker API access, as shown above.
- Bind Dashmark to `127.0.0.1` or keep it on a private Docker network, then publish it through a reverse proxy.
- When exposing Dashmark, put authentication in the reverse proxy. Authentik and Authelia work with the default group-header detection.
- If Dashmark must be directly reachable, set `AUTH_TOKEN` and configure the proxy to overwrite `X-Dashmark-Token` with that shared secret. Generate one with `openssl rand -hex 32`.

Access group headers are only safe when the proxy removes or overwrites client-supplied values.

## Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run typecheck
npm run build
```

`npm run dev` uses a mock Docker API, sample cards, and sample authentication headers. It simulates the `admins`, `media`, and `family` groups, and limits status badges to `admins` by default. It does not need a Docker daemon and supports hot reload. Override either value to test other cases, for example `MOCK_USER_GROUPS=media STATUS_BADGE_ACCESS=admins npm run dev`.

Contributions are welcome. Please open an issue or pull request with a clear description of the change.

## Donations

Feel free to donate if you'd like to support the development of Dashmark.

<a href="https://www.buymeacoffee.com/edmogeor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## AI assistance

Dashmark is developed with assistance from AI tools. The maintainer reviews and remains responsible for all changes.

## Thanks

- [selfh.st/icons](https://github.com/selfhst/icons) for the bundled icon index under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
- [Homepage](https://gethomepage.dev/) for reference implementations of provider metrics and API response shapes.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the shipped attribution details.

## License

[MIT](LICENSE)
