# Realtime Collection and Delivery Plan

## Goal

Replace browser-driven status and metric polling with one server-owned collection coordinator and one authenticated WebSocket per visible dashboard tab. The server collects each source once, persists history once, and sends authorized snapshots and deltas only to interested clients.

The dashboard must not fall back to recurring HTTP polling. Dashmark exposes no HTTP status or metrics snapshots.

## Decisions

| Area                    | Decision                                                                      |
| ----------------------- | ----------------------------------------------------------------------------- |
| Realtime transport      | Native same-origin WebSocket                                                  |
| Browser connections     | One socket per visible dashboard tab                                          |
| Status subscription     | Automatic after a socket connects                                             |
| Metrics subscription    | Explicit per-card subscribe/unsubscribe while active                          |
| Authentication          | Existing reverse-proxy/session authentication on the WebSocket upgrade        |
| `AUTH_TOKEN`            | Proxy injects `X-Dashmark-Token`; it is never sent to browser JavaScript      |
| Data authority          | Server collector and SQLite history                                           |
| Dashboard HTTP fallback | None, reconnect the WebSocket and resubscribe instead                         |
| Deployment              | One long-lived Dashmark process per deployment                                |
| Multiple replicas       | Unsupported until shared storage, collector leadership, and pub-sub are added |

The one-process boundary is already implicit in the current implementation: collectors, caches, and SQLite are local to the Node process. The new architecture must document this constraint rather than silently running duplicate collectors in replicas.

## Collection Coordinator

### Discovery and status

- Refresh Docker discovery, resolved cards, and container status at startup and after relevant Docker container events. Reconnect event streams with backoff and refresh after reconnect.
- Resolve each eligible metric target during discovery: effective collection interval, retention period, resource requirements, custom metric definitions, and uptime metrics.
- Keep a current status snapshot in memory.
- Reuse discovery output for metric scheduling so due metric collection does not reload YAML, parse labels, look up containers, or list all Docker containers again.
- Recompute target schedules after every discovery refresh to account for configuration and container changes.

### Due scheduling

- Replace the global `setInterval` in `src/lib/metrics.ts` with a single timer scheduled for the earliest target due time.
- Track each target's last successful attempt and next due time.
- Collect only due targets.
- A target with an interval shorter than the dashboard default must be collected at its own interval.
- A target with a longer interval must not cause repeated full-card scans between collections.
- If work is queued, retain one pending run per target instead of queueing duplicates.

### Bounded work

| Work                              | Initial limit | Purpose                                                        |
| --------------------------------- | ------------: | -------------------------------------------------------------- |
| Due card collections              |             8 | Prevent unbounded dashboard-wide fan-out                       |
| Docker stats requests             |             8 | Bound Docker socket and CPU use                                |
| Requests per custom-metric origin |             2 | Protect upstream services without serial head-of-line blocking |
| `for_each` child requests         |             4 | Retain the existing bounded behavior                           |

- Replace the strict `requestQueues` serialization in `src/lib/custom-metrics.ts` with a per-origin semaphore.
- Keep existing timeout, response-size, pagination, and `for_each` limits.
- Record collection duration, queue delay, timeout count, and skipped duplicate work in structured logs.

## Storage and Retention

### Remove duplicate writes

- Keep `resource_metrics` as the only history table for CPU, memory, received, and sent values.
- Stop inserting resource values into `metric_samples` from `saveResourceMetric`.
- Restrict `metric_samples` to numeric custom metrics.
- Preserve batched transactions, but update in-memory snapshots and publish events only after a transaction commits.

### Per-target retention

- Add `card_metric_retention` for resource/custom history retention by card.
- Add `uptime_metric_retention` for uptime retention by card and metric key.
- Refresh retention metadata during discovery, even when a target is not due for collection.
- Prune each history table by its target-specific retention metadata.
- Remove retention metadata and associated history when discovery confirms a card or metric was removed.
- Remove the current global history prune, which can delete a card's longer configured history early.

## Uptime Collection

Yesterday's uptime collection behavior remains authoritative.

- Continue storing raw uptime observations in SQLite.
- Continue deduplicating observations by timestamp, status, and response time.
- Continue accepting sources that return historical observations rather than only the latest status.
- Preserve the 30-day minimum uptime history and longer configured retention.
- Preserve successful history if a later collection fails, marking it stale rather than replacing it with an error.

Do not send raw 30-day observation arrays for every realtime update.

- Compute fixed-size heartbeat bucket summaries on the server.
- Send an initial bounded bucket summary with a metric subscription snapshot.
- Recompute and send only an affected bucket when new observations are merged.
- Send a refreshed summary when bucket boundaries roll over.
- Keep raw observations in storage for correctness and future detailed queries.

## WebSocket Protocol

### Client messages

```json
{ "type": "subscribe_status" }
{ "type": "subscribe_metrics", "cardId": "default:abc123" }
{ "type": "unsubscribe_metrics", "cardId": "default:abc123" }
```

### Server messages

```json
{ "type": "status_snapshot", "version": 10, "statuses": {} }
{ "type": "status_delta", "version": 11, "cardId": "default:abc123", "status": {} }
{ "type": "metrics_snapshot", "version": 12, "cardId": "default:abc123", "metrics": {} }
{ "type": "metrics_delta", "version": 13, "cardId": "default:abc123", "metrics": {} }
{ "type": "uptime_bucket_delta", "version": 14, "cardId": "default:abc123", "key": "gatus/uptime", "bucket": {} }
```

### Protocol rules

- Every authorized subscription begins with a complete filtered snapshot.
- Deltas are only sent after the corresponding snapshot.
- Versions are monotonic. A reconnect discards uncertain client state and accepts fresh snapshots as authoritative.
- Reject malformed, unknown, unauthorized, and over-limit subscription requests.
- Cap metric subscriptions per socket.
- Cap queued outbound bytes/events per socket and disconnect slow consumers.
- Bound each WebSocket lifetime, initially one hour, so proxy-provided identity headers are periodically re-evaluated on reconnect.
- Close sockets when the server shuts down and allow normal reconnect/resubscribe behavior.

## Authentication and Authorization

- The WebSocket upgrade uses the existing reverse proxy and trusted identity headers.
- If `AUTH_TOKEN` is enabled, the proxy must inject `X-Dashmark-Token` during the upgrade, just as it does for regular requests.
- Native browser WebSockets cannot attach the custom header directly. Do not put tokens in query strings or expose them to JavaScript.
- Derive the user/access context when the socket opens.
- Authorize every card subscription and filter every outgoing snapshot/delta server-side.
- Treat unauthorized data as invisible. Do not expose whether a hidden card or metric exists.
- Reject cross-origin upgrades unless explicitly supported and origin-validated.

There is no Dashmark login or session expiration state. If a proxy session expires, it owns re-authentication. Dashmark only reports that live updates cannot reconnect.

## Client Changes

### Dashboard status

- Replace `useStatusPolling` with a WebSocket client hook.
- Connect only when `document.visibilityState` is `visible`.
- Subscribe to status once connected.
- Close the socket immediately when the tab becomes hidden.
- Reconnect with capped exponential backoff when visible.
- Do not periodically fetch `/api/status` after a failed reconnect.

### Card metrics

- Replace the timer in `useMetrics` with WebSocket card subscriptions.
- Subscribe while a card is hovered, its resource tooltip is open, or its detail dialog is open.
- Unsubscribe when all active states end.
- Apply resource/custom deltas locally and trim history to its declared retention window.
- Apply server-provided uptime bucket deltas without reprocessing raw observation histories in the browser.
- Mark loading complete only after the initial metrics snapshot arrives.

### Error states

Use three card/metric states:

- `pending`: subscribed or collecting, but no first result exists.
- `stale`: a last successful value exists, but refresh or realtime delivery failed.
- `unavailable`: no usable value exists.

Show a dashboard-level warning only after reconnect retries are exhausted: "Live updates are unavailable. Data may be out of date."

Show card/metric-local states for resource, custom metric, and uptime failures. Keep errors inline rather than repeatedly raising toasts. Preserve last successful data with a stale indicator when safe.

## Logging Policy

### UI only

- Realtime unavailable after retry exhaustion.
- Container status updates unavailable.
- A resource metric, custom metric, or uptime metric is pending, stale, or unavailable.

### Logs only

- Raw Docker/custom-source failures, upstream response bodies, URLs, headers, credentials, stacks, config paths, and SQLite errors.
- Invalid metric configuration details.
- Queue depth/delay, repeated timeouts, protocol violations, slow-consumer disconnects, and collector timing.

### Both UI and logs

- Status collector failure.
- Resource/custom/uptime collection failure.
- Database write failure.
- Realtime connection repeatedly failing.

WebSocket events carry stable safe error codes, scope, retryability, and stale state. The UI maps codes to messages. Logs retain sanitized operational context.

## HTTP Endpoints

- Remove `/api/status`, `/api/metrics`, and legacy `/api/resources`; Dashmark has no external API consumers.
- The React dashboard receives all status and metric data through its authenticated WebSocket.

## Mock Development Server

Update the mock development environment so it exercises the production realtime path rather than client-only demo polling.

- Keep `scripts/mock-docker-server.mjs` as the mock Docker API. Its generated stats already provide changing CPU, memory, and network data for the server collector.
- Add controlled mock container status transitions so status deltas can be observed without restarting development.
- Replace `MOCK_AUTH` special handling that bypasses collector startup with a mock WebSocket upgrade identity path. Development WebSocket connections must receive the same mock user/group context as HTTP requests.
- Uptime demo data must flow through the collector and realtime event model.
- Remove `useDemoMetrics` and client-side demo intervals from `src/components/use-metrics.ts` once the WebSocket mock path is available.
- Provide mock uptime observations from a local deterministic mock metric source or a collector fixture, including new observations and transient failures.
- Make `scripts/dev-with-demo.mjs` start the mock Docker API, mock metric source, and Astro server together, with orderly shutdown for all child servers.
- Exercise two mock Docker hosts, access-controlled cards, resource metrics, custom metrics, uptime metrics, status transitions, reconnects, and unavailable-source states.

The development mode must validate server collection, persistence, authorization filtering, WebSocket snapshots, and deltas. It must not simulate these solely in React state.

## Test Plan and Redundant Test Cleanup

### Add or update tests

- Scheduler tests for mixed intervals, target discovery/removal, overdue work, and no duplicate pending work.
- Concurrency tests proving global, Docker, and per-origin limits.
- Storage tests proving resource samples no longer create `metric_samples` rows.
- Retention tests for shorter, default, longer, deleted, and uptime-specific histories.
- Uptime tests for historical responses, deduplication, stale fallback, bucket updates, reconnect snapshots, and 30-day minimum retention.
- WebSocket integration tests for handshake auth, access filtering, snapshots, deltas, reconnects, malformed messages, subscription limits, and slow consumers.
- Browser tests for hidden-tab disconnect, visible-tab reconnect, active-card subscription cleanup, and absence of recurring dashboard HTTP polling.
- Mock development integration tests for changing Docker stats/statuses, uptime updates, and mock authorization.

### Remove or consolidate tests

- Delete timer-specific polling tests when the polling hooks are removed.
- Replace `tests/lib/use-status-polling.test.ts` only if its status merge reducer is no longer used. If the reducer remains, move its pure-state coverage to the realtime status reducer test rather than retaining a polling-named test.
- Remove demo-only polling tests after the mock development server exercises collector-generated updates.
- Remove HTTP endpoint tests with the removed routes. Preserve their authorization coverage through WebSocket integration tests.
- Do not delete behavioral coverage merely because its implementation changed. Every removed test must be mapped to a replacement scheduler, storage, WebSocket, or browser test.

## Delivery Sequence

1. Extract discovery/status and resolved metric target models from `src/lib/docker.ts`.
2. Implement the collection coordinator, due scheduling, and bounded work queues.
3. Add retention metadata, remove duplicate resource writes, and migrate pruning.
4. Remove obsolete HTTP status and metrics routes.
5. Implement the authenticated WebSocket server, subscription registry, protocol validation, versioning, and slow-client limits.
6. Publish status/resource/custom/uptime updates only after persistence succeeds.
7. Update the mock development server to provide realtime-compatible auth, Docker status changes, metric data, and uptime fixtures.
8. Replace React polling with visible-tab WebSocket lifecycle and card subscriptions.
9. Replace raw uptime client histories with server bucket summaries.
10. Remove obsolete polling/demo code and redundant tests after replacement coverage passes.
11. Document proxy WebSocket requirements and the single-process deployment constraint.

## Acceptance Criteria

- Docker and custom metric collection frequency is independent of connected browser count.
- No dashboard client issues recurring `/api/status` or `/api/metrics` requests.
- Hidden tabs hold no WebSocket connection and cause no metric refresh activity.
- Per-target intervals and retention periods are honored.
- Resource values are persisted once per sample.
- Uptime historical collection, deduplication, retention, and heartbeat display remain correct.
- Restricted cards and metrics never appear in WebSocket messages or snapshots.
- A dropped/restarted connection recovers from authoritative snapshots without duplicate or missing client state.
- The mock development server demonstrates the same collector and realtime path used in production.
