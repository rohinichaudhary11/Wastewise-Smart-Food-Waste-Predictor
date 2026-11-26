# Security and tenant scope

## Organisation boundary

- Resolve the current organisation only from the authenticated session (`req.auth.organisationId`). Never trust an organisation ID from request bodies, query strings, or route parameters.
- Every read, update, delete, aggregate, and populate for organisation-owned data must include the authenticated organisation ID. For outlet data, include both organisation and outlet IDs.
- Verify that a selected outlet belongs to the authenticated organisation before using it. A valid ObjectId is not proof of ownership.
- User login first resolves the public organisation slug, then looks up the email with both the resolved organisation ID and email. Refresh sessions and user routes filter by both user ID and organisation ID.
- Add cross-organisation access tests whenever an organisation-scoped endpoint is added.

## Sessions and requests

- Access JWT: 15 minutes, `HttpOnly`, `SameSite=Strict`, `Secure` in production, HMAC-SHA-256, checked against an active organisation, active user, and active refresh session on every protected request.
- Refresh token: random secret, stored as SHA-256 digest only, one active digest per session, rotated atomically, seven-day expiry. Reuse of a stale token revokes that session.
- CSRF token: host-only cookie plus matching request header; the token contains an HMAC signature. All unsafe API methods require it, including login and logout.
- Configure `CLIENT_ORIGIN` as an exact comma-separated allowlist. Do not use wildcard CORS with credentials. Terminate TLS at the public edge and set `TRUST_PROXY=true` only behind a known trusted proxy.
- The current login rate limiter uses process memory. A multi-instance production deployment must configure a shared limiter store before running more than one API process.
- Argon2id hashes passwords. Do not log request bodies, cookies, authorization headers, CSRF values, passwords, or raw refresh tokens.

## Database and input

- Use Zod allowlists for request bodies. Do not turn user-provided objects into MongoDB filters or update operators.
- Keep MongoDB replica-set transactions enabled for first-organisation creation. The default development secret values are examples and must be replaced before deployment.
- Audit organisation, outlet, and user-management actions. Record identifiers and role changes, never credentials.
