export const DEFAULT_PORT = 4321
export const MAX_PORT = 65_535

export const AUTO_ACCESS_GROUPS_HEADER = 'auto'
export const ACCESS_GROUPS_HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export const AUTH_TOKEN_HEADER = 'X-Dashmark-Token'

export const AUTO_GROUP_HEADERS = ['X-Authentik-Groups', 'Remote-Groups', 'X-Auth-Request-Groups', 'X-Forwarded-Groups', 'X-Auth-Groups']

export const AUTO_NAME_HEADERS = ['X-Authentik-Name', 'Remote-Name', 'X-Auth-Request-Preferred-Username', 'X-Forwarded-Preferred-Username', 'X-Auth-Name']

export const AUTO_FIRST_NAME_HEADERS = ['X-Authentik-Given-Name']

export const AUTO_LAST_NAME_HEADERS = ['X-Authentik-Family-Name']

export const AUTO_USERNAME_HEADERS = ['X-Authentik-Username', 'Remote-User', 'X-Auth-Request-User', 'X-Forwarded-User', 'X-Auth-Username']

export const AUTO_EMAIL_HEADERS = ['X-Authentik-Email', 'Remote-Email', 'X-Auth-Request-Email', 'X-Forwarded-Email', 'X-Auth-Email']

export const DOCKER_REQUEST_TIMEOUT_MS = 10_000
export const DOCKER_MAX_RESPONSE_BYTES = 10 * 1024 * 1024
export const DOCKER_STATUS_CACHE_TTL_MS = 30_000
export const DOCKER_TLS_PORT = 2376
export const DOCKER_PLAIN_PORT = 2375
export const DOCKER_API_FALLBACK_VERSION = '1.41'
export const COMPOSE_SERVICE_LABEL = 'com.docker.compose.service'

export const LABEL_PREFIX = 'dashmark'
export const TRAEFIK_ROUTER_RULE = /^traefik\.http\.routers\.[^.]+\.rule$/

export const IMAGE_SUFFIXES = ['-server', '-client', '-web', '-app', '-service', '-core', '-api', '-docker', '-ce', '-ee']

export const SELFHST_PREFIX = 'selfhst:'
export const SELFHST_CDN = 'https://cdn.jsdelivr.net/gh/selfhst/icons@main'
export const SELFHST_GITHUB_API_URL = 'https://api.github.com/repos/selfhst/icons/contents/svg'
export const DASHBOARD_ICONS_PREFIX = 'dashboard:'
export const DASHBOARD_ICONS_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons'
export const SELFHST_PAGE_SIZE = 100
export const SELFHST_MAX_PAGES = 100
export const SELFHST_FETCH_TIMEOUT_MS = 10_000
export const FUZZY_MATCH_THRESHOLD = 0.2
export const FUZZY_MIN_LENGTH_RATIO = 0.75
export const FUZZY_REFERENCE_WEIGHT = 0.7
export const FUZZY_NAME_WEIGHT = 0.3

export const ICON_CACHE_MAX_AGE = 3600
export const ICON_MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export const MORNING_START_HOUR = 5
export const AFTERNOON_START_HOUR = 12
export const EVENING_START_HOUR = 17

export const DEFAULT_METRICS_POLL_INTERVAL_MS = 10_000
export const METRICS_HISTORY_PERIOD_MS = 5 * 60_000
export const UPTIME_HISTORY_PERIOD_MS = 30 * 24 * 60 * 60_000
export const STATUS_TOAST_ID = 'status-warning'
export const ERROR_TOAST_DEBOUNCE_MS = 2_000
export const ERROR_TOAST_RESOLVE_GRACE_MS = 10_000
export const DISCOVERY_EVENT_DEBOUNCE_MS = 250
export const DOCKER_EVENT_RECONNECT_DELAY_MS = 1_000

export const CUSTOM_METRIC_REQUEST_TIMEOUT_MS = 5_000
export const CUSTOM_METRIC_MAX_RESPONSE_BYTES = 1024 * 1024
export const BULK_HISTORY_MAX_RESPONSE_BYTES = 4 * 1024 * 1024
export const CUSTOM_METRIC_REQUESTS_PER_ORIGIN = 2
export const MAX_FOR_EACH_ITEMS = 32
export const FOR_EACH_CONCURRENCY = 4
export const MAX_PAGINATION_PAGES = 32
export const MAX_AUTH_STEPS = 5
export const MAX_EXTRACTED_TOKENS = 16
export const MAX_JQ_PROCESSES = 4
export const MAX_DUE_CARD_COLLECTIONS = 8
export const NETWORK_RATE_PRIME_DELAY_MS = 1_000
export const METRIC_RECOVERY_RETRY_BASE_MS = 10_000
export const METRIC_RECOVERY_MAX_RETRY_MS = 5 * 60_000
export const METRIC_RECOVERY_MAX_OBSERVATIONS = 500
export const METRIC_RECOVERY_MAX_CHECKPOINT_BYTES = 4 * 1024
export const METRIC_RECOVERY_MAX_STALLED_PAGES = 3
export const PAGINATED_UPTIME_RECOVERY_SOURCE_PREFIX = 'http-pagination:'

export const REALTIME_INITIAL_RECONNECT_DELAY_MS = 1_000
export const REALTIME_MAX_RECONNECT_DELAY_MS = 30_000
export const REALTIME_UNAVAILABLE_AFTER_ATTEMPTS = 5
export const REALTIME_MAX_CLIENT_MESSAGE_BYTES = 16 * 1024
export const REALTIME_MAX_METRIC_SUBSCRIPTIONS = 32
export const REALTIME_MAX_OUTBOUND_EVENTS = 64
export const REALTIME_MAX_OUTBOUND_BYTES = 1024 * 1024
export const REALTIME_SOCKET_LIFETIME_MS = 60 * 60_000

export const TOOLTIP_DELAY_MS = 100

export const LOADING_DELAY_MS = 300
export const LOADING_MIN_DURATION_MS = 300

export const THEME_STORAGE_KEY = 'dashmark-theme'
export const THEME_REVEAL_TIMEOUT_MS = 4000

export const MARQUEE_SPEED = 80
export const MARQUEE_FADE_WIDTH = 16

export const SEARCH_FUZZY_THRESHOLD = 0.2

export const VERSION_CHECK_TIMEOUT_MS = 5_000
export const VERSION_CHECK_CACHE_TTL_MS = 60 * 60_000
export const VERSION_CHECK_FAILURE_CACHE_TTL_MS = 5 * 60_000

export const LAYOUT_ANIMATION_DELAY_MS = 300

export const MAX_CUSTOM_METRIC_STATE_LABEL_LENGTH = 32

export const METRICS_TOOLTIP_VISIBLE_ROW_LIMIT = 4
export const MAX_CHART_POINTS = 600
