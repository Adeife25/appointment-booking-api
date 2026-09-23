# Appointment & Service Booking API

Backend API for discovering service providers, viewing services and availability, and booking appointments. Customers book time with providers; providers manage their services, availability, and appointments; admins oversee the platform and verify providers.

## Stack

- **NestJS 11** + **TypeScript 5.7**
- **Prisma 7** (`prisma-client` generator → `src/generated/prisma`) with the `@prisma/adapter-pg` driver adapter
- **PostgreSQL 16** (Docker Compose)
- **@nestjs/schedule** hourly appointment-reminder cron
- **@nestjs/throttler** rate limiting, **helmet**, **bcrypt**, **passport-jwt** (access + refresh tokens), **passport-google-oauth20** (optional social login)
- **nestjs-pino** structured logging, **Prometheus** metrics (via `@willsoto/nestjs-prometheus`)
- **@nestjs/swagger** API docs, **Resend** transactional email, **@nestjs/terminus** health checks
- **Redis 7** via `@keyv/redis` for optional HTTP response caching (`@nestjs/cache-manager`)
- **nginx** reverse proxy (TLS termination point, edge rate limiting, gzip) in the Docker Compose stack
- CI via GitHub Actions (`build`/`lint`/`unit`, `e2e` against a Postgres service, docker build, deploy placeholder)

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Docker with the daemon running (for the development database)

## Setup

```bash
npm install
cp .env.example .env    # then adjust secrets
node scripts/start-db.mjs   # or: npm run db:up (started automatically by start/start:dev)
npx prisma migrate deploy
npm run prisma:seed      # bootstrap admin, demo customer/provider, services, availability
```

The `prestart` / `prestart:dev` npm hooks run `scripts/start-db.mjs`, which starts the `db` container and waits for PostgreSQL before the app boots.

## Running

```bash
npm run start        # development
npm run start:dev    # watch mode
npm run build        # compile to dist/
npm run start:prod   # production build
```

- API base path: `/api/v1` (`/health` and `/metrics` are outside the prefix)
- Swagger docs: `http://localhost:3001/api/docs` (enable with `SWAGGER_ENABLED=true`)
- Health: `GET /health`, metrics: `GET /metrics`

## Roles

| Role      | Description                                                              |
| --------- | ------------------------------------------------------------------------ |
| `ADMIN`   | Platform administration; cannot be created via public registration        |
| `PROVIDER`| Manage own profile, services, availability, appointments; requires admin verification to be booked |
| `CUSTOMER`| Discover providers, book/cancel appointments, leave reviews               |

Public registration accepts `provider` or `customer` only (`register.dto.ts`). The first admin is bootstrapped by the seed using `SEED_ADMIN_*`.

## Environment variables

See `.env.example` for the full list. Notable configuration:

| Variable                | Default             | Purpose                                       |
| ----------------------- | ------------------- | --------------------------------------------- |
| `DATABASE_URL`          | —                   | PostgreSQL connection string                  |
| `DATABASE_MAX_CONNECTIONS` | `10`             | Max Postgres connections per API instance (raise on large replica counts) |
| `PORT`                  | `3001`              | HTTP port                                     |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | Token signing secrets (≥ 32 chars)  |
| `CANCEL_WINDOW_HOURS`   | `24`                | How long before a booking a customer may cancel |
| `REMINDER_LEAD_HOURS`   | `24`                | Send a reminder when an appointment starts within this window |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | `60` / `60`      | Global rate limit window/limit (seconds, requests) |
| `THROTTLE_AUTH_TTL` / `THROTTLE_AUTH_LIMIT` | `60` / `5` | Stricter limit for auth endpoints |
| `THROTTLE_PUBLIC_TTL` / `THROTTLE_PUBLIC_LIMIT` | `60` / `120` | Looser limit for public browse endpoints (providers/services/slots) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | `admin@example.com` / … | Bootstrap admin credentials |
| `RESEND_API_KEY`        | —                   | Transactional email provider key              |
| `RETURN_RESET_TOKEN`    | `false`             | Dev-only: return password-reset tokens instead of emailing |
| `SWAGGER_ENABLED`       | `true`              | Serve `/api/docs`                             |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | —  | Enable Google OAuth login (providers registered only when both are set) |
| `GOOGLE_CALLBACK_URL`   | `http://localhost:3001/api/v1/auth/google/callback` | Google OAuth redirect target |
| `REDIS_URL`             | —                   | Redis connection string (omit to use in-memory cache) |
| `CORS_ORIGINS`          | `http://localhost:3001` | Comma-separated allowed origins           |

## Endpoints

### Public
- `GET /api/v1` — service info
- `GET /health`, `GET /metrics` — health check and Prometheus metrics
- `GET /api/v1/public/providers/:slug`, `GET /api/v1/public/services/:slug` — shareable provider/service pages (accept **slug or id**)
- `GET /api/v1/availability/providers/:providerId/slots?from=YYYY-MM-DD&to=YYYY-MM-DD` — open + already-booked slots for a provider over a date range (max 31 days; UTC)
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`
- `GET /api/v1/auth/google`, `GET /api/v1/auth/google/callback` — Google OAuth flow (enabled when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set; returns a token pair on callback; accounts are created/linked by email)

### Authenticated
- `GET|PATCH|DELETE /api/v1/users/me`, `PATCH /api/v1/users/me/password`
- `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:id/read`
- `POST /api/v1/appointments`, `GET /api/v1/appointments`, `GET|PATCH /api/v1/appointments/:id`
- `POST /api/v1/appointments/:id/confirm|reject|complete|cancel`
- `GET /api/v1/providers/:id`, `GET|PATCH /api/v1/reviews/:id`, `DELETE /api/v1/reviews/:id`
- `GET /api/v1/dashboard/provider/overview|schedule`, `GET /api/v1/dashboard/customer/overview`

### Provider
- `GET|PATCH /api/v1/providers/:id`, `POST /api/v1/services`, `GET /api/v1/services`, `GET|PATCH|DELETE /api/v1/services/:id`
- `POST /api/v1/availability`, `PATCH|DELETE /api/v1/availability/:id`, `GET /api/v1/availability/providers/:providerId/availability`

### Admin
- `GET /api/v1/users`, `PATCH /api/v1/users/:id/activate|deactivate`
- `PATCH /api/v1/providers/:id/verify|unverify`
- `PATCH /api/v1/reviews/:id`, `DELETE /api/v1/reviews/:id`
- `GET /api/v1/dashboard/admin/overview|appointments|trends|top-providers`

All authenticated endpoints require `Authorization: Bearer <access-token>`.

### Booking flow

1. **Provider sets up what they offer** — `POST /api/v1/services` (returns the service `id` and `slug`).
2. **Provider defines weekly working hours** — `POST /api/v1/availability` with `{ dayOfWeek: 0-6 (0=Sunday..6=Saturday), startTime: '09:00', endTime: '17:00' }`. Availability is a **recurring weekly schedule**: add one slot per weekday you work (Monday 09:00-17:00, Tuesday 09:00-17:00, ...), not per calendar date.
3. **Customer picks a real date/time** — `GET /api/v1/availability/providers/:providerId/slots?from=YYYY-MM-DD&to=YYYY-MM-DD` expands those weekly rules into real dates and returns `open` vs `booked` windows.
4. **Customer books** — `POST /api/v1/appointments` with `{ providerProfileId, serviceId, startTime }` (ISO datetime inside an open window). The response includes the generated appointment **`id`** — use it for `GET/PATCH /api/v1/appointments/:id`, `POST /api/v1/appointments/:id/confirm|reject|complete|cancel`, reminders, and reviews.

## Data seeding

`npm run prisma:seed` (fired automatically when creating migrations via `prisma migrate dev`, configured in `prisma7.config.ts`) idempotently upserts:

- an `ADMIN` user from `SEED_ADMIN_*`
- a demo customer (`customer@example.com`)
- a verified demo provider **Sara Beauty Studio** (`sara.provider@example.com`) with two services and five weekly availability slots

## Database

```bash
npm run db:up            # start the dev Postgres container
npm run db:down          # stop it
npx prisma migrate dev   # create/apply migrations (runs seed)
npx prisma migrate deploy
npx prisma studio        # browse data
```

## Reverse proxy

The Compose stack includes an `nginx` reverse proxy in front of the API:

- All external traffic hits the proxy on `${PORT:-3001}` and is forwarded to the API container (which is no longer published to the host).
- gzip compression, `client_max_body_size`, and per-IP edge rate limiting (`30 r/s`, burst 60) are configured in `nginx/nginx.conf`.
- `proxy_pass` uses a Docker-DNS-resolved variable (`api:3001` re-resolved every 10s), so nginx round-robins across **multiple API replicas**. Scale out with:
  ```bash
  docker compose up -d --build --scale api=3
  ```
- Standard forwarding headers are injected (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Request-Id`), so prefer placing TLS termination here or at your load balancer.

Run the full stack (API image build + proxy) with:

```bash
docker compose up -d --build
```

Local development without Docker still runs the API directly on `PORT` (default `3001`).

## Request correlation

Every request is tagged with a UUID (reused from a client-supplied `X-Request-Id` when present) and echoed back as `X-Request-Id`. It is included in structured request logs and in every error response body (`requestId`), so you can trace a failing request from the edge through the API. Validation errors also surface as a single string (array messages are joined) for a consistent error shape.

## Caching

- Get responses for providers, services, availability, and dashboards are cached through `@nestjs/cache-manager`.
- Slot availability (`GET /api/v1/availability/providers/:providerId/slots?...`) is cached for 30 seconds behind a `CacheInterceptor` keyed by provider/date range, so repeated page loads of a calendar do not hammer the DB.
- Authenticated user context (used by the JWT strategy on every request) is cached for 60 seconds and invalidated on role/password/profile changes, cutting per-request DB lookups.
- Set `REDIS_URL` (e.g. `redis://localhost:6379`) to enable the Redis-backed store. Without it, the app falls back to an in-memory cache — no Redis required for local dev.
- The `api` service in `docker-compose.yml` connects to the bundled `redis` service automatically; start it with `docker compose up -d redis`.
- Cache TTLs: providers/services 5 minutes, availability 2 minutes, dashboards 1 minute. Provider/service/availability caches are invalidated on write; dashboard caches expire by TTL only.
- When Redis is unreachable the cache degrades gracefully (requests fall through to the database) rather than failing or hanging.
- With `REDIS_URL` set, rate-limit counters also live in Redis (`SharedThrottlerStorage`), so limits are enforced globally across replicas; if Redis drops, throttling falls back to the in-memory store instead of failing.

## Scaling & performance

Designed to serve roughly 5 000 active users from a single instance, with headroom:

- **Rate-limit tiers**: browse endpoints get a looser default (`THROTTLE_PUBLIC_LIMIT=120/min`) than global/auth limits, so a read-heavy home page cannot lock users out while write paths stay protected.
- **Atomic booking**: creating an appointment runs inside a read-committed transaction that takes a row lock on the provider profile (`SELECT ... FOR UPDATE`) and re-checks for overlapping appointments, so simultaneous bookings of the same slot serialize and only one wins (the loser gets `409`). Verified by `test/booking-concurrency.e2e-spec.ts`.
- **Notifications off the request path**: appointment booking/confirm/cancel dispatch emails in the background (`dispatchAppointmentEvent`); a resend-with-backoff (2 retries) guards against transient transport failures without blocking the booking response. The hourly reminder cron *awaits* delivery before marking a reminder sent.
- **Single-writer cron**: the hourly reminder job acquires a Redis distributed lock (`cron:appointment-reminders`, 15-min TTL) so scaling out replicas does not duplicate reminder emails; without Redis the lock degrades to a no-op.
- **Connection budget**: each instance uses up to `DATABASE_MAX_CONNECTIONS` Postgres connections (default 10). Plan replica count so `replicas × connections` stays below your Postgres `max_connections` (see `SHOW max_connections;`).
- **Horizontal scale-out**: `docker compose up --scale api=N` behind the nginx proxy adds instances; the Redis cache, Redis throttler storage, distributed cron lock, and per-replica DB pools keep sessions and counters consistent across them.

A rough read-load smoke test ships in `scripts/load-test.js`:

```bash
node scripts/load-test.js --url http://localhost:3001 --rps 40 --duration 20
```

It reports status distribution (watch for `429`s once you exceed the browse throttle) and p50/p95/p99 latency.

## Notifications

- In-app notifications are created synchronously when a user has the preference enabled; email is sent via Resend.
- Email delivery retries twice with exponential backoff (`~0.5s`, `~1s`) on transport failures; after retries it logs and gives up rather than failing the request.
- `sendPasswordResetEmail` is awaited (users land on a success message), but appointment-event emails never block booking.

## Testing

```bash
npm test                  # unit tests (jest)
npm run test:cov          # coverage
npm run test:e2e          # e2e suite (requires a running PostgreSQL)
npm run lint              # eslint --fix
npx tsc --noEmit          # typecheck
```

## Project layout

```
src/
  auth/            registration (no ADMIN), login/refresh, throttling
  users/           profiles, notification settings, admin user management
  providers/       profiles, admin verify/unverify
  services/        provider services
  availability/    weekly availability slots
  appointments/    booking lifecycle, confirmation, completion, cancellation, reminders
  reviews/         provider reviews
  notifications/   in-app notifications + Resend email, reminder messages
  dashboard/       admin/provider/customer analytics
  common/          guards (JWT, roles), transform interceptor, exception filter, request-id middleware
  config/          env validation, configuration
  health/          terminus health checks, metrics
  prisma/          PrismaService with driver adapter
nginx/             reverse proxy configuration
prisma/
  schema.prisma    data model
  migrations/      versioned SQL migrations
  seed.ts          bootstrap + demo data
scripts/start-db.mjs  dev database startup + readiness wait
```