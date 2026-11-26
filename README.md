# WasteWise

Food preparation and leftover tracking for restaurants and college canteens. The project is being delivered in the six phases described in [docs/PHASES.md](docs/PHASES.md). The current implementation is **Phase 1: repository foundation, organisation-scoped data models, cookie authentication, and roles**. Later phase features are not represented as finished.

## Requirements

- Node.js 24 LTS (Node.js 22.12 or newer also satisfies the toolchain requirements)
- Docker Desktop with Docker Compose

## Start Phase 1

1. Copy `.env.example` to `.env` and replace both secrets with independent random values of at least 32 characters.
2. Run `docker compose up -d mongo`, then `docker compose run --rm mongo-init` to initialise MongoDB as a single-node replica set (needed for atomic organisation registration).
3. Run `npm install` and `npm run dev` from the repository root.
4. The API is available at `http://localhost:5000/api/v1`; the current client is at `http://localhost:5173`.

The API fails closed if MongoDB is unavailable. There is no in-memory persistence fallback. Browser clients must first request `GET /api/v1/auth/csrf`, then send the returned token in the `X-CSRF-Token` header for every POST/PATCH/DELETE request and include credentials. Auth cookies are httpOnly, SameSite=Strict, and Secure in production. Set `CLIENT_ORIGIN` to the exact public client origin behind TLS.

## Phase 1 API

- `GET /api/v1/health`
- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/register` — create an organisation, first outlet and its administrator
- `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET|POST|PATCH /api/v1/outlets` — all reads/writes are organisation scoped; mutations are admin only
- `GET|POST|PATCH /api/v1/users` — user management is organisation scoped; mutations are admin only

All API errors use `{ "error": { "code": "...", "message": "..." } }`. Daily logs, calendar events and forecasts store a date-only `YYYY-MM-DD` value alongside the outlet time-zone snapshot (default `Asia/Kolkata`); audit and event timestamps remain UTC instants. Passwords are hashed with Argon2id. Access JWTs expire after 15 minutes. Refresh tokens are random, hashed at rest, single-use and rotated on refresh. CSRF uses a host-only double-submit token. Login, registration and refresh have rate limits. User-provided query objects are not accepted.

## Checks

Run `npm run lint`, `npm test`, and `npm run build`. The default API tests cover health, CSRF, request validation, tenant-aware schema indexes and model validation without requiring a database. To run the MongoDB-backed registration, role, refresh-rotation and cross-organisation tests, set `TEST_MONGODB_URI=mongodb://127.0.0.1:27017/wastewise_test?replicaSet=rs0` before running `npm test`. The root `package-lock.json` pins the full workspace dependency tree.
