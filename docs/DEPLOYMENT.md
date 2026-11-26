# Deployment and operations

This guide covers local development and production operations. WasteWise is currently deployed on Vercel; see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for the live endpoints and hosting-specific setup.

## Local development

1. Install Node.js 24, Python 3.12, and Docker Desktop with Compose.
2. Copy `.env.example` to `.env`; generate separate random 32+ character values for `JWT_ACCESS_SECRET`, `CSRF_SECRET`, and `ML_INTERNAL_API_KEY`.
3. Set `MONGODB_URI=mongodb://127.0.0.1:27017/wastewise?replicaSet=rs0` for the Compose replica set. Set `CLIENT_ORIGIN=http://localhost:5173` and `COOKIE_SECURE=false` for local HTTP.
4. Run `docker compose up -d --build`, then `npm ci` and `npm run dev`.
5. Open `http://localhost:5173`. The Vite development server proxies `/api` to Express on port 5000. MongoDB is on 27017 and the ML service is on `127.0.0.1:8000`.

Set `TEST_MONGODB_URI` to a separate local test database when running the Mongo-backed integration suite. Tests create test organisations and remove their own records; never point this at a production database.

## Production checklist

- Use managed MongoDB with TLS, least-privilege credentials, automated backups, and a tested restore procedure. Allow network access only from the application host. URL-encode reserved characters in database usernames and passwords. Never place a live URI in source control or a client environment variable.
- Provide production secrets through the hosting platform's secret store. Use unique cryptographically random values for the access-token signing secret, CSRF secret, and internal ML key. Rotate them through a planned session invalidation.
- Serve the built client and API over HTTPS on the same site where possible. Set `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=true` only behind a trusted proxy, and `CLIENT_ORIGIN` to the exact HTTPS origin(s). Do not use wildcard CORS origins with credentials.
- Run Express and the ML service on private networking. Only Express should be able to reach ML endpoints; set the same internal key on both. Keep the ML model volume persistent and restrict filesystem access to the service account.
- Build the client with `npm run build`; serve `client/dist` through a static host or reverse proxy. Route `/api/*` to Express and add TLS, request timeouts, and a conservative body-size limit at the edge.
- Start Express only after MongoDB is reachable; the server creates indexes at startup and exposes `/api/v1/health` for readiness. Check the ML `/health` endpoint separately. Configure process restarts and alert on repeated health failures.
- Run CI before release. Back up the database before schema/index changes. Review `docs/DATA.md` before using public benchmarks; production model training must use only the organisation's own records.
- Keep LLM summaries disabled unless explicitly configured. LLM output must only summarize computed findings; it must not generate preparation quantities.

## Local Docker services

Compose currently provides MongoDB and the ML service. Express and Vite run with `npm run dev` on the host. The current compose file publishes the ML port only to loopback and includes a persistent model volume. For production, deploy behind private networking and HTTPS rather than exposing development ports.
