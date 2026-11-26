# WasteWise

### Smart food preparation forecasting for restaurants and college canteens

WasteWise helps kitchen teams record preparation, demand and leftovers, understand waste patterns, and plan tomorrow's quantities. The app combines an organisation-scoped operations dashboard with a separate forecasting service and manager-reviewed preparation plans.

**Live app:** [wastewise-web-rho.vercel.app](https://wastewise-web-rho.vercel.app) · **Status:** deployed on Vercel

> Forecasts and sustainability figures shown in demo views are illustrative. Synthetic demo records are explicitly labelled and must not be treated as real kitchen performance or model accuracy.

## What it does

- **Daily kitchen records:** log prepared quantities, unserved leftovers, plate waste, meal, customer count, sell-outs and calendar context.
- **Tomorrow's plan:** generate item-level P50, P80 or P90 demand recommendations, review the reasons and confidence, then accept or record a manager override.
- **Waste analytics:** inspect waste quantity, rates, cost, weekday and meal patterns, trends, top-wasted items and operational alerts.
- **Menu and outlets:** manage food items, units, batch sizes, cost, shelf life, outlets and organisation users.
- **CSV workflows:** preview imports with row-level validation and duplicates, then export spreadsheet-safe records.
- **Forecast evaluation:** compare predictions with observed demand, keep sold-out (censored) rows separate, and compare model results with baselines.
- **Sustainability tools:** track recommendations, challenges and recorded food donations; environmental conversions are estimates based on stated assumptions.
- **Secure organisation access:** role-based permissions, tenant-scoped database access, Argon2id password hashes, short-lived access tokens, rotating refresh tokens, CSRF checks, rate limits and audit records.

## Product preview

The public landing page and authenticated workspace share the WasteWise GreenTech design system. Sign in or create a workspace from the live app to explore the kitchen dashboard, daily entry, tomorrow's forecast, analytics, recommendations and reports.

## Architecture

```text
React + Vite client
        │ same-origin /api rewrite
        ▼
Express API ───── MongoDB Atlas
        │ private key-authenticated requests
        ▼
FastAPI ML service ───── GridFS model registry
```

| Area | Stack |
| --- | --- |
| Web client | React, Vite, React Router, TanStack Query, React Hook Form, Zod, Recharts, Tailwind CSS |
| API | Node.js, Express, Mongoose, Zod |
| Forecasting | Python, FastAPI, pandas, scikit-learn, LightGBM, joblib |
| Persistence | MongoDB and GridFS for model artifacts |
| Local services | Docker Compose |
| CI | GitHub Actions: JavaScript lint, tests, build, audit; Python tests and lint |

Only the Express server calls the ML API. Production model training uses a tenant's own operational records; public benchmark and synthetic data are for pipeline checks only.

## Run locally

### Requirements

- Node.js 24 (Node.js 22.12 or newer is supported by the package engine range)
- Python 3.12 for the ML service and Python checks
- Docker Desktop with Docker Compose

### Setup

1. Clone the repository and create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Replace the placeholder secrets in `.env` with unique random values of at least 32 characters. Keep `.env` local; it is ignored by Git. Configure an Atlas URI or use the local Compose MongoDB URI shown in the example.
3. Install dependencies and start services:

   ```powershell
   npm ci
   docker compose up -d --build
   npm run dev
   ```

4. Open the client at [http://localhost:5173](http://localhost:5173). The API is at [http://localhost:5000/api/v1](http://localhost:5000/api/v1); the ML service is bound to loopback on port 8000.

The API requires MongoDB and does not fall back to in-memory persistence. Atomic workspace registration needs the local MongoDB replica set initialized by the Compose setup. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for local service details and production guidance.

## Environment variables

Use [.env.example](.env.example) as the template. The main settings are:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Application database connection |
| `JWT_ACCESS_SECRET`, `CSRF_SECRET` | Independent authentication and CSRF secrets |
| `CLIENT_ORIGIN` | Exact allowed browser origin(s), comma-separated |
| `ML_SERVICE_URL`, `ML_INTERNAL_API_KEY` | Private API-to-ML connection |
| `CRON_SECRET` | Protects scheduled weekly training |
| `TEST_MONGODB_URI` | Separate disposable database for integration tests |

Never add credentials to the client, source files, screenshots, issues or commits. Use your hosting provider's secret store for deployed environments.

## Quality checks

```sh
npm run lint
npm test
npm run build
```

The server integration suite needs `TEST_MONGODB_URI` pointing to a **separate test database**. It creates and cleans up test records. Python checks:

```sh
python -m pip install -r ml-service/requirements-dev.txt
python -m ruff check ml-service data
python -m pytest ml-service/tests data
```

CI runs these checks on pushes and pull requests. The database-independent tests can run without Atlas; Mongo-backed integration tests need their configured test database.

## Forecast design

WasteWise predicts demand rather than waste:

```text
consumed demand = quantity prepared − unserved leftover
```

Plate waste is tracked separately for portion insights. Sell-outs are censored observations: they show demand was at least the consumed quantity, and are kept out of ordinary error metrics. Models use only information available before the prediction date. Baselines include same-weekday demand and rolling medians; candidates are promoted only when expanding-window backtests outperform the best baseline. Low-history items use a manual estimate or recent median according to configurable thresholds. Recommendations round up to the item's batch size and do not subtract previous leftovers unless reuse is explicitly safe.

See [docs/ML.md](docs/ML.md), [docs/FORECASTS.md](docs/FORECASTS.md) and [docs/DATA.md](docs/DATA.md) for evaluation, decision rules and data provenance.

## Deployment

The current deployment uses separate Vercel projects for the client, Express API and ML service, with MongoDB Atlas for application data. See [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md) for project setup and operational considerations. Deployments are not triggered by local edits; follow the Vercel workflow described there after changing production code.

## Contributing

Issues and pull requests are welcome. Please include reproduction steps for bugs, avoid committing secrets or raw datasets, and run the relevant checks before opening a pull request. Dataset licenses and limitations are documented in [docs/DATA.md](docs/DATA.md).

## License

No open-source license has been selected yet. All rights are reserved unless a license is added to this repository.
