# 🌿 WasteWise — Smart Food Waste Predictor
### Prepare smarter. Waste less. Plan tomorrow's kitchen with confidence.

WasteWise helps restaurants and college canteens record daily preparation and leftovers, spot waste patterns, and make better food preparation decisions for the next service.

🌐 **Live app:** [wastewise-web-rho.vercel.app](https://wastewise-web-rho.vercel.app)

**[Key Features](#-key-features) · [How It Works](#-how-it-works) · [Quick Start](#-quick-start-guide) · [API Reference](#-api-reference) · [Customising](#-customising) · [Technology Stack](#-technology-stack)**

* * *

## 📌 Overview

WasteWise brings everyday kitchen records and next-day planning into one workspace. Teams record what was prepared, what was consumed and what remained. Managers can review forecasts, see the signals behind them, choose a service level and save an accepted plan or a quantity override.

The application is split into a React client, an organisation-scoped Express API, and a Python forecasting service. Only Express calls the internal ML service. MongoDB stores organisation data, while the model registry persists trained artifacts through MongoDB GridFS.

```text
┌──────────────────────────┐
│ React + Vite workspace   │
│ Daily entry · Analytics  │
│ Plans · Reports          │
└────────────┬─────────────┘
             │ same-origin /api requests
             ▼
┌──────────────────────────┐       ┌──────────────────────────┐
│ Express API              │──────▶│ MongoDB Atlas            │
│ Auth · Roles · Operations│       │ Organisation data        │
└────────────┬─────────────┘       └──────────────────────────┘
             │ Internal API key
             ▼
┌──────────────────────────┐       ┌──────────────────────────┐
│ FastAPI forecasting      │──────▶│ GridFS model registry    │
│ Backtests · Predictions  │       │ Persisted model files    │
└──────────────────────────┘       └──────────────────────────┘
```

> **Demo data:** Forecast examples, dashboard sample figures and sustainability conversions shown in demo views are illustrative. Synthetic demo records are labelled and are not real kitchen results or evidence of model accuracy.

* * *

## ✨ Key Features

- 🍲 **Daily food records:** Save prepared quantity, unserved leftovers, optional plate waste, meal, customer count, sell-outs and notes.
- 🔮 **Tomorrow's preparation plan:** Generate item-level demand ranges at P50, P80 or P90, inspect reasons and confidence, then accept or override with a manager note.
- 📊 **Waste analytics:** Review waste quantity and rate, cost, trends, category mix, meal and weekday patterns, and most-wasted items.
- 🧺 **Menu and outlet management:** Configure food categories, units, batch sizes, unit costs, shelf life, outlets and team access.
- 📥 **CSV import and export:** Preview rows, detect duplicates, report row-level validation errors and export spreadsheet-safe data.
- 📈 **Forecast accuracy:** Compare saved predictions with actual demand and baselines; keep sold-out observations separate from ordinary error metrics.
- 🔔 **Insights and alerts:** Surface operational patterns when there are enough records, and identify high waste, repeated sell-outs or missing meal entries.
- 🌱 **Sustainability workspace:** Track recommendations, weekly challenges and recorded food donations. Environmental values are estimates based on assumptions.
- 🔐 **Organisation-scoped access:** Role checks, tenant-scoped database queries, Argon2id password hashing, rotating refresh tokens, CSRF checks, rate limits and audit records.

* * *

## 🧩 How It Works

| Stage | What happens |
| --- | --- |
| **1. Record** | Kitchen staff enter what was prepared, unserved leftovers, plate waste and service context. |
| **2. Learn** | Analytics reveal recurring waste and demand patterns using the organisation's own records. |
| **3. Forecast** | Baselines or a validated model estimate tomorrow's demand and provide a likely range. |
| **4. Decide** | A manager reviews the suggested quantities, chooses a service level and accepts or overrides the plan. |
| **5. Improve** | Actual service records feed later backtests and help the team refine future preparation. |

WasteWise predicts **demand**, not waste:

```text
consumed demand = quantity prepared - unserved leftover
```

Plate waste is kept separate for portion insights. A sell-out is treated as censored demand: it indicates that true demand was at least the amount consumed. Such records are excluded from ordinary error metrics so they do not pull recommendations downward.

* * *

## 🏗️ Project Structure

```text
wastewise/
├── client/                  # React + Vite app and authenticated workspace
│   ├── public/images/       # Landing page produce artwork
│   └── src/auth/            # Login, dashboard, entry, forecast and analytics pages
├── server/                  # Express API
│   ├── src/auth/            # Registration, login, roles and sessions
│   ├── src/analytics/       # Analytics, forecast and model-run routes
│   ├── src/operations/      # Menu, daily logs, calendar and CSV workflows
│   ├── src/models/          # Mongoose data models
│   └── src/security/        # Passwords, tokens, cookies and CSRF
├── ml-service/              # FastAPI forecasting and model persistence
│   ├── app/                 # Features, backtests, predictions and model store
│   └── tests/               # ML API and persistence tests
├── data/                    # Synthetic demo generator and benchmark pipeline
├── docs/                    # Data, API, forecasting, security and deployment docs
├── .github/workflows/       # GitHub Actions checks
├── docker-compose.yml       # Local MongoDB replica set and ML service
└── .env.example             # Safe local configuration template
```

* * *

## 🚀 Quick Start Guide

### Prerequisites

- Node.js 24 recommended (the package engine range supports Node.js 22.12 and newer)
- Python 3.12 for the ML service and Python checks
- Docker Desktop with Docker Compose

### Step 1: Clone the project

```sh
git clone https://github.com/rohinichaudhary11/Wastewise-Smart-Food-Waste-Predictor.git
cd Wastewise-Smart-Food-Waste-Predictor
```

### Step 2: Configure local environment

```powershell
Copy-Item .env.example .env
```

Replace placeholder values in `.env` with unique random secrets of at least 32 characters. Keep this file local; it is ignored by Git. Use the local MongoDB URI for the Compose replica set or configure your own Atlas URI.

### Step 3: Install and start

```sh
npm ci
docker compose up -d --build
npm run dev
```

Docker Compose starts MongoDB, initializes its replica set for transactions, and runs the ML service on loopback. The API and web client run from the host.

### Step 4: Open WasteWise

- Web app: [http://localhost:5173](http://localhost:5173)
- Express API: [http://localhost:5000/api/v1](http://localhost:5000/api/v1)
- ML health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

The API requires MongoDB and has no in-memory persistence fallback. For more details, read [Deployment & Operations](docs/DEPLOYMENT.md).

### Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Express API and Vite client together. |
| `npm run lint` | Run ESLint across workspaces. |
| `npm test` | Run client and server test suites. Mongo-backed tests need `TEST_MONGODB_URI`. |
| `npm run build` | Build client and validate server entry points. |

### Environment variables

Use [.env.example](.env.example) as the template. Important settings:

| Name | Purpose |
| --- | --- |
| `MONGODB_URI` | Application database connection. |
| `TEST_MONGODB_URI` | Separate disposable database for integration tests. |
| `JWT_ACCESS_SECRET`, `CSRF_SECRET` | Independent auth-token and CSRF signing secrets. |
| `CLIENT_ORIGIN` | Exact allowed browser origin(s), comma-separated. |
| `ML_SERVICE_URL`, `ML_INTERNAL_API_KEY` | Private Express-to-ML connection. |
| `CRON_SECRET` | Protects the weekly model-training endpoint. |
| `MIN_MODEL_RECORDS`, `MIN_BASELINE_RECORDS` | Configurable history thresholds for forecasting. |
| `MODEL_MONGODB_URI` | Optional MongoDB location for persistent ML model artifacts. |

Never put credentials in client code, screenshots, issues or commits. Use the hosting provider's secret store for deployed environments.

* * *

## 🔌 API Reference

The REST API is prefixed with `/api/v1`. Full OpenAPI documentation is in [`docs/openapi.yaml`](docs/openapi.yaml).

| Route | Purpose |
| --- | --- |
| `/auth` | CSRF bootstrap, registration, login, refresh, logout and current session. |
| `/users`, `/outlets` | Organisation user and outlet management. |
| `/menu-items` | Food catalogue and manager-set cold-start estimates. |
| `/logs` | Daily records, CSV template, import preview/commit and export. |
| `/calendar` | Holiday, exam, event and special-menu context. |
| `/analytics` | Waste summaries, trends, insights and alerts. |
| `/forecasts` | Preparation plan, manager decisions and forecast accuracy. |
| `/reports` | Weekly PDF report. |
| `/health` | API and database readiness. |

API errors follow `{ "error": { "code": "...", "message": "..." } }`. Mutating requests require the CSRF cookie value in the `X-CSRF-Token` header.

* * *

## 🎨 Customising

- **Menu and kitchen setup:** Sign in as an administrator and configure outlets, team access and menu items from the workspace.
- **Cold-start estimates:** Managers can set a manual estimate for menu items that do not yet have enough history.
- **Forecast thresholds:** Configure `MIN_MODEL_RECORDS` and `MIN_BASELINE_RECORDS` through environment settings.
- **Demo records:** Generate six months of deterministic synthetic records with `python data/generate_demo_data.py --output data/synthetic_demo.json`. Generated data is for demonstration and pipeline checks only.
- **Deployment:** Update the Vercel project settings and follow [Vercel Deployment](docs/VERCEL_DEPLOYMENT.md). Never commit production secrets.
- **Data sources:** Check [Data Sources & Licenses](docs/DATA.md) before downloading or using public benchmarks.

* * *

## 🛠️ Technology Stack

| Area | Technologies |
| --- | --- |
| **Web client** | React, Vite, React Router, TanStack Query, React Hook Form, Zod, Recharts, Tailwind CSS, Lucide |
| **API** | Node.js, Express, Mongoose, Zod, Argon2id, JWT cookies |
| **Forecasting** | Python, FastAPI, pandas, scikit-learn, LightGBM, joblib |
| **Database** | MongoDB Atlas, MongoDB GridFS |
| **Local development** | Docker Compose, Vite proxy |
| **Deployment** | Vercel, GitHub Actions |

* * *

## 📚 Documentation

- [Forecast methodology](docs/FORECASTS.md)
- [ML service and evaluation](docs/ML.md)
- [Data sources and licenses](docs/DATA.md)
- [Security notes](docs/SECURITY.md)
- [Local deployment and operations](docs/DEPLOYMENT.md)
- [Vercel deployment](docs/VERCEL_DEPLOYMENT.md)
- [Project phases](docs/PHASES.md)

* * *

## 🤝 Contributing

Bug reports and improvements are welcome. Include steps to reproduce issues, avoid committing secrets or raw datasets, and run the relevant checks before opening a pull request. Review the data source licenses before adding benchmark material.

* * *

## 📄 License

No open-source license has been selected yet. All rights are reserved unless a license is added.

---

**WasteWise** · Thoughtful kitchens. A lighter footprint. 🌱
