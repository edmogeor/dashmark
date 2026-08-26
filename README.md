<div align="center">
  <img src="public/brand/icon.svg" width="140" alt="Dashmark logo"/>
  <h1>Dashmark</h1>
  <p>A lightweight dashboard for your Docker services.</p>
  <p>
    <a href="https://github.com/edmogeor/dashmark/actions/workflows/ci.yml">
      <img src="https://github.com/edmogeor/dashmark/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"/>
    </a>
    <a href="https://github.com/fallow-rs/fallow">
      <img src="https://raw.githubusercontent.com/edmogeor/dashmark/badges/badge.svg" alt="fallow health"/>
    </a>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"/>
    </a>
  </p>
</div>

Dashmark finds Docker containers with `dashmark.*` labels and displays them as cards. Labels can set a card's link, title, icon, category, metrics, and access rules. It is a self-hosted Node.js service built with Astro.

![Dashmark dashboard](assets/screenshot.png)

<p align="center"><a href="https://edmogeor.github.io/dashmark/demo/">View the live demo</a></p>

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configure cards](#configure-cards)
- [Dashboard settings](#dashboard-settings)
- [Metrics](#metrics)
- [Security](#security)
- [Development](#development)
- [License](#license)

## Features

- Discover opt-in containers on one or more Docker hosts.
- Create cards from Docker labels or YAML.
- Reuse Traefik host rules for card links.
- Organise cards with categories, aliases, and custom ordering.
- Show container state, health, and resource metrics.
- Limit cards and metrics by groups from an authentication proxy.
- Use automatic, selfh.st, remote, local, or placeholder icons.
- Add descriptions from the selfh.st app directory.

## Quick start

You need Docker Compose and access to the Docker socket. The example uses a restricted socket proxy, so Dashmark does not receive the raw socket.

1. Download [`docker-compose.yml`](docker-compose.yml), or create a file with this content:

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
       cap_drop:
         - ALL
       security_opt:
         - no-new-privileges
       command:
         - "-loglevel=info"
         - "-listenip=0.0.0.0"
         - "-allowfrom=dashmark"
         - "-allowGET=/version"
         - "-allowGET=/v1\\..{1,2}/containers/json"
         - "-allowGET=/v1\\..{1,2}/containers/.*/stats"
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock:ro
   ```

2. Add labels to a service:

   ```yaml
   services:
     plex:
       image: plexinc/pms-docker
       labels:
         - "dashmark.url=https://plex.example.com"
         - "dashmark.title=Plex"
         - "dashmark.category=Media"
   ```

3. Start Dashmark and your labeled services:

   ```bash
   docker compose up -d
   ```

4. Open <http://localhost:4321>.

Dashmark creates a card for each eligible container. Recreate a container after changing its labels.

## Configure cards

A container appears when it has at least one `dashmark.*` label and Dashmark can determine a link from `dashmark.url`, YAML, or a supported Traefik host rule. Traefik labels alone do not add a card.

### Docker labels

| Label | Purpose |
| --- | --- |
| `dashmark.hidden` | Set to `true` to hide the container. |
| `dashmark.url` | Card link. Dashmark can infer this from a Traefik rule. |
| `dashmark.title` | Card title. Defaults to the container name. |
| `dashmark.description` | Tooltip text. Set to `none` to disable automatic descriptions. |
| `dashmark.icon` | `selfhst:<slug>`, an image URL, a path in `ICONS_DIR`, or `placeholder`. |
| `dashmark.category` | Category name. Matching ignores case. |
| `dashmark.order` | Order within a category. Lower values appear first. |
| `dashmark.search_aliases` | Comma-separated extra search terms. |
| `dashmark.access` | Comma-separated list of allowed access entries. |
| `dashmark.show_status` | Set to `false` to hide the status badge and resource tooltip. |
| `dashmark.metrics` | Comma-separated built-in metrics (`cpu`, `memory`, `network`) and catalog metrics (`provider/metric`). Set to `none` to disable built-in metrics. |
| `dashmark.metrics_url` | Private HTTP(S) API base for catalog metrics. Defaults to the card URL. |
| `dashmark.metrics_access.<metric>` | Comma-separated access entries for one metric. Replace `/` with `.` in catalog metric keys. |
| `dashmark.metric_*` | Optional catalog credentials. See [Metrics](metrics/README.md). Docker labels are visible through Docker APIs and inspect output. |

`CATEGORY_ORDER=Media,Productivity,Home` sets the order for listed categories. Other categories follow alphabetically, and uncategorised cards appear last.

### YAML cards and overrides

Mount a directory at `/data`. Dashmark reads an optional configuration file at `/data/config.yml`, icons from `/data/icons`, and a stylesheet from `/data/custom.css`.

Use `settings` for dashboard settings. Each other top-level key is a service. A key that matches a container name or Compose service name overrides that card. Any unmatched key creates a standalone card and must include `url`.

```yaml
settings:
  category_order: [Media, Home]

plex:
  title: Plex
  url: https://plex.example.com
  icon: selfhst:plex
  category: Media
  order: 1
  access: [media]

github:
  title: GitHub
  url: https://github.com
  category: External
```

YAML settings override environment variables, and YAML card fields override Docker labels. Fields that accept a list also accept one value or a comma-separated string. Dashmark reports unknown keys and invalid values instead of silently using a default. See [`data/config.yml`](data/config.yml) for a commented example.

With multiple Docker hosts, use `<host-id>/<container-or-service-name>` to target one host. An unqualified key applies to matching containers on every host. A host-qualified key takes precedence.

```yaml
plex:
  category: Media

home/plex:
  title: Home Plex
  url: https://plex.home.example.com

vps/plex:
  title: VPS Plex
  url: https://plex.vps.example.com
```

Available card fields are `title`, `description`, `url`, `icon`, `category`, `host`, `order`, `hidden`, `show_status`, `metrics`, `access`, and `search_aliases`. `host` adds a host badge to a standalone card or forces one on a Docker card.

### Icons and descriptions

Dashmark uses icons in this order:

1. `placeholder` shows title initials and stops icon guessing.
2. An `http` or `https` URL is used directly.
3. `selfhst:<slug>` uses the bundled [selfhst](https://selfh.st/) index.
4. Any other value is a path inside `ICONS_DIR`.
5. With no icon value, Dashmark guesses from the container image name.
6. If no icon is found, Dashmark shows initials.

With `ENABLE_AUTOMATIC_DESCRIPTIONS=true`, Dashmark matches cards without descriptions against the bundled [selfh.st app directory](https://selfh.st/apps/) index. Set a description to `none` to disable this for one card. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for attribution.

## Dashboard settings

Configure Dashmark with environment variables or the `settings` section of `config.yml`. `CONFIG_FILE` is environment-only because Dashmark needs it before it reads YAML. `port` and `auth_token` can be set in YAML. A YAML `auth_token` must reference one environment variable or secret file, never a literal secret.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOCKER_HOSTS` | `unix:///var/run/docker.sock` | One Docker endpoint, or named endpoints separated by commas. |
| `CONFIG_FILE` | `/data/config.yml` | YAML configuration file path. |
| `ICONS_DIR` | `/data/icons` | Local icon directory. |
| `PORT` | `4321` | HTTP port. YAML `port` overrides it. |
| `CUSTOM_STYLESHEET` | unset | Mounted CSS file path, served as `/custom.css`. |
| `ENABLE_ACCESS_CONTROL` | `false` | Filter cards by authenticated access entries. |
| `ACCESS_GROUPS_HEADER` | `auto` | Groups header name, or automatic provider detection. |
| `SHOW_HEADER` | `true` | Show the greeting header. |
| `SHOW_GROUP_TAGS` | `true` | Show matching access or status groups. |
| `SHOW_THEME_TOGGLE` | `true` | Show the light and dark theme toggle. |
| `CUSTOM_HEADER` | unset | Greeting template. |
| `USER_NAME_HEADER`, `USER_FIRST_NAME_HEADER`, `USER_LAST_NAME_HEADER`, `USER_USERNAME_HEADER`, `USER_EMAIL_HEADER` | `auto` | Headers for greeting template values. |
| `SHOW_SEARCH` | `true` | Show search and category filters. |
| `SHOW_STATUS` | `true` | Show container state and health badges. |
| `STATUS_BADGE_ACCESS` | unset | Access entries allowed to see status badges. |
| `SHOW_METRICS` | `true` | Collect and show metrics. |
| `METRICS_ACCESS` | unset | Access entries allowed to receive metrics. |
| `METRICS_DATABASE_PATH` | `/tmp/dashmark/metrics.db` | SQLite metric-history database. Use a mounted path to retain history. |
| `METRICS_POLL_INTERVAL` | `10` | Seconds between metric samples. |
| `METRICS_HISTORY_PERIOD` | `300` | Seconds of history shown in live tickers. |
| `STATUS_POLL_INTERVAL` | `30` | Seconds between container status updates. |
| `CATEGORY_ORDER` | unset | Comma-separated category order. |
| `ENABLE_AUTOMATIC_DESCRIPTIONS` | `true` | Add a description when one is available. |
| `ENABLE_AUTOMATIC_ICONS` | `true` | Guess icons from image names. |
| `SHOW_BRANDING` | `true` | Show the Dashmark logo near search. |
| `NEW_TAB` | `false` | Open card links in a new tab. |
| `AUTH_TOKEN` | unset | Require `X-Dashmark-Token: <token>` on every request. |

For one remote Docker host, set `DOCKER_HOSTS=tcp://dockerproxy:2375`. For several hosts, use named endpoints:

```yaml
environment:
  - DOCKER_HOSTS=home=tcp://home-proxy:2375,vps=tcp://vps-proxy:2375
```

Host IDs use letters, numbers, `_`, and `-`. They must be unique. Dashmark keeps working with reachable hosts if another host is unavailable. Use a restricted socket proxy on every remote host over a private network. Do not expose Docker or a socket proxy on the public internet.

### Styling

Mount a stylesheet and set `CUSTOM_STYLESHEET` to its path in the container. Dashmark loads it after its built-in styles. Use the semantic `dashmark-*` classes, rather than Tailwind utilities or DOM position. [`config/custom.css.example`](config/custom.css.example) lists the supported classes.

### Access and greetings

Set `ENABLE_ACCESS_CONTROL=true` to show a card only when an `access` entry matches the authenticated user's group, username, or email. Cards with no access entries remain visible. Dashmark returns an error when the groups header is missing. Matching ignores case.

`ACCESS_GROUPS_HEADER=auto` checks Authentik, Authelia, oauth2-proxy, and Keycloak Gatekeeper headers. Set it to a header name for another proxy. Values may be comma-, semicolon-, or pipe-separated, or a JSON array. Configure the proxy to remove or overwrite client-supplied group headers.

`STATUS_BADGE_ACCESS` and `METRICS_ACCESS` restrict those features to matching users. The default header greets the authenticated user. Use `CUSTOM_HEADER`, such as `CUSTOM_HEADER={greeting}, {first_name}!`, to change it. The available tags are `{greeting}`, `{full_name}`, `{first_name}`, `{last_name}`, `{username}`, and `{email}`.

## Metrics

Dashmark collects Docker CPU, memory, and network usage, plus catalog and custom service metrics. Catalog metrics are opt-in. Add a catalog metric with `dashmark.metrics=provider/metric` or under `service.metrics.catalog` in YAML.

```yaml
labels:
  dashmark.metrics: cpu,memory,radarr/queue
  dashmark.metrics_url: http://radarr:7878
```

YAML-only cards support catalog and local metrics, not Docker usage metrics. Set `METRICS_DATABASE_PATH` to a mounted path when history must survive container replacement. The [Metrics guide](metrics/README.md) covers metric selection, credentials, shared sources, local metrics, and the full YAML schema.

## Security

- Use a socket proxy with read-only, restricted Docker API access. Do not mount the raw Docker socket into Dashmark.
- Bind Dashmark to `127.0.0.1` or a private Docker network. Publish it through a reverse proxy.
- Authenticate users at the reverse proxy. Authentik and Authelia work with the default group-header detection.
- For direct access, set `AUTH_TOKEN` and have the proxy overwrite `X-Dashmark-Token` with that secret. Generate a token with `openssl rand -hex 32`.

## Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run typecheck
npm run build
```

`npm run dev` uses a mock Docker API, sample cards, and sample authentication headers. It does not need Docker and supports hot reload. It simulates the `admins`, `media`, and `family` groups. For example, run `MOCK_USER_GROUPS=media STATUS_BADGE_ACCESS=admins npm run dev` to test a different user.

Contributions are welcome. Open an issue or pull request with a clear description of the change.

## Donations

If Dashmark is useful to you, you can support its development.

<a href="https://www.buymeacoffee.com/edmogeor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## AI assistance

AI tools assist development. The maintainer reviews and remains responsible for every change.

## Thanks

- [selfh.st/icons](https://github.com/selfhst/icons) for the bundled icon index under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
- [Homepage](https://gethomepage.dev/) for reference implementations of provider metrics and API response shapes.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for shipped attribution details.

## License

[MIT](LICENSE)
