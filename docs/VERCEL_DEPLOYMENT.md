# Vercel deployment

WasteWise is deployed as three Vercel projects so its browser, Express API, and Python ML service can use their supported runtimes. The browser calls the API through a same-origin Vercel rewrite, so the existing secure cookies continue to work.

## Current production endpoints

- Web: <https://wastewise-web-rho.vercel.app>
- API: <https://wastewise-api-dun.vercel.app>
- ML service: <https://wastewise-ml.vercel.app>

The API health endpoint has been verified with MongoDB Atlas connected, and the ML service health endpoint has returned healthy. Health checks do not replace end-to-end account and kitchen workflow testing after a release.

## Required account and Atlas setup

- The Vercel account used for this deployment is on Hobby, which uses dynamic outbound addresses. Review the Atlas Network Access allowlist before putting real operational data in the app. Avoid `0.0.0.0/0`; use a hosting plan with fixed egress or another managed option that lets Atlas allowlist only the application's addresses.
- Use separate least-privilege database users where possible: the Express API user needs read/write access to the WasteWise application database; the ML user needs access only to its model-artifacts database (for example, `wastewise_models`). Never commit database URIs or credentials.
- Do not put credentials in Vite variables, source files, or committed `.env` files. Enter secrets in Vercel Project Settings → Environment Variables.

## Projects

Create three Vercel projects from the same repository:

| Project | Root directory | Runtime |
| --- | --- | --- |
| WasteWise API | `server` | Node.js / Express |
| WasteWise ML | `ml-service` | Python 3.12 / FastAPI |
| WasteWise web | `client` | Vite static site |

`server/vercel.json` and `ml-service/vercel.json` set the function region to Mumbai (`bom1`), close to an Atlas cluster in `ap-south-1`. Confirm the Atlas cluster region before deployment and adjust both if it differs.

## Environment variables

Set these in the API project for Production and Preview as appropriate:

```text
NODE_ENV=production
MONGODB_URI=<Atlas application database URI>
JWT_ACCESS_SECRET=<unique random secret, at least 32 characters>
CSRF_SECRET=<different unique random secret, at least 32 characters>
COOKIE_SECURE=true
TRUST_PROXY=true
CLIENT_ORIGIN=<exact WasteWise web project origin>
ML_SERVICE_URL=<WasteWise ML project origin>
ML_INTERNAL_API_KEY=<unique random secret shared only by API and ML projects>
CRON_SECRET=<unique random secret, at least 32 characters>
```

Set these in the ML project:

```text
ML_INTERNAL_API_KEY=<same value as the API project's ML_INTERNAL_API_KEY>
MODEL_MONGODB_URI=<Atlas URI for the separate model-artifacts database>
MIN_MODEL_RECORDS=28
MIN_BASELINE_RECORDS=7
```

The ML project stores trained model files and registry manifests in MongoDB GridFS. Vercel function filesystems are temporary, so the separate model database is required for trained models to survive cold starts and redeployments. The web project must not receive any database or signing secrets.

## Deployment order

1. Link and deploy the API and ML projects first. Configure their environment variables and Atlas static-IP allowlist before verifying `/api/v1/health` and `/health`.
2. Copy the API project's stable `*.vercel.app` domain into `client/vercel.json` as an external rewrite for `/api/:path*`. This keeps browser requests on the web origin while forwarding API traffic to Express.
3. Set the exact web project origin in the API project's `CLIENT_ORIGIN`, then deploy the web project.
4. Run the smoke checks below and inspect Vercel function logs. Never promote a deployment that reports the database or ML store as unavailable.

## Smoke checks

- `GET https://<api-domain>/api/v1/health` returns `200` and `database: "connected"`.
- `GET https://<ml-domain>/health` returns `200`.
- `GET https://<web-domain>/` loads the landing page; refreshing `/login` and `/app/daily-entry` serves the SPA.
- Through the web domain, register/sign in, create a menu item, save a daily log, generate a forecast, and verify an override persists after reload.
- Train a model, then verify the model registry and prediction still use the saved model after a new function invocation.
- Confirm cookies are secure and the Atlas allowlist contains only Vercel's assigned static egress addresses.

The Vercel projects and production environment variables are configured in the hosting account. Their secrets are intentionally not reproduced in this repository. Local edits do not deploy automatically unless they are pushed through the configured deployment workflow.
