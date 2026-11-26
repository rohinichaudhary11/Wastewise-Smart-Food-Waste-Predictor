<div align="center">

# WasteWise <br><sub>Smart Food Waste Predictor</sub>

**Prepare smarter. Waste less.**

Turn kitchen records into practical, explainable preparation plans for restaurants and college canteens.

[![Open WasteWise](https://img.shields.io/badge/Open-Live%20App-176B45?style=for-the-badge&logo=vercel&logoColor=white)](https://wastewise-web-rho.vercel.app)
[![CI](https://img.shields.io/github/actions/workflow/status/rohinichaudhary11/wastewise-smart-food-waste-predictor/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/rohinichaudhary11/wastewise-smart-food-waste-predictor/actions)
[![Private repository](https://img.shields.io/badge/Repository-Private-525866?style=for-the-badge&logo=github&logoColor=white)](https://github.com/rohinichaudhary11/wastewise-smart-food-waste-predictor)

</div>

> **Demo data notice:** Forecasts and sustainability figures shown in demo views are illustrative. Synthetic demo records are labelled and must not be treated as real kitchen performance or model accuracy.

## The idea

WasteWise gives kitchen teams one place to record what they prepared, understand what was consumed or left over, and plan tomorrow's quantities. Managers can inspect the signals behind a recommendation, choose a service level and record an override.

## Inside the stack

Each technology group is shown as a compact badge card so the main building blocks are easy to scan.

<table>
  <tr>
    <td align="center" width="25%">
      <strong>01 · Kitchen workspace</strong><br><sub>Responsive data entry and dashboards</sub><br><br>
      <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white"><br>
      <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white"><br>
      <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white">
    </td>
    <td align="center" width="25%">
      <strong>02 · Application API</strong><br><sub>Tenant-scoped operations and auth</sub><br><br>
      <img alt="Node.js" src="https://img.shields.io/badge/Node.js-24-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white"><br>
      <img alt="Express" src="https://img.shields.io/badge/Express-5-222222?style=for-the-badge&logo=express&logoColor=white"><br>
      <img alt="MongoDB" src="https://img.shields.io/badge/Mongoose-9-880000?style=for-the-badge&logo=mongoose&logoColor=white">
    </td>
    <td align="center" width="25%">
      <strong>03 · Forecast service</strong><br><sub>Backtests, baselines and demand ranges</sub><br><br>
      <img alt="Python" src="https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white"><br>
      <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white"><br>
      <img alt="scikit-learn" src="https://img.shields.io/badge/scikit--learn-F7931E?style=for-the-badge&logo=scikitlearn&logoColor=white">
    </td>
    <td align="center" width="25%">
      <strong>04 · Data and delivery</strong><br><sub>Persistent storage and automated checks</sub><br><br>
      <img alt="MongoDB Atlas" src="https://img.shields.io/badge/MongoDB_Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white"><br>
      <img alt="Docker Compose" src="https://img.shields.io/badge/Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white"><br>
      <img alt="Vercel" src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white">
    </td>
  </tr>
</table>

<div align="center">
<sub>React · Vite · Tailwind CSS · Node.js · Express · MongoDB · Python · FastAPI · pandas · scikit-learn · LightGBM · Docker · GitHub Actions</sub>
</div>

## How the pieces connect

<table>
  <tr>
    <th align="center">Kitchen team</th>
    <th align="center">WasteWise web</th>
    <th align="center">Express API</th>
    <th align="center">Data + forecasting</th>
  </tr>
  <tr>
    <td align="center">Records meals, preparation, leftovers and context</td>
    <td align="center">React + Vite<br>same-origin API requests</td>
    <td align="center">Auth, roles, validation and organisation-scoped data access</td>
    <td align="center">MongoDB Atlas<br>FastAPI model service<br>GridFS model registry</td>
  </tr>
</table>

Only the Express server calls the ML service, using a private API key. Production model training uses the organisation's own operational records. Public benchmark and synthetic data are for pipeline checks only.

## What teams can do

| Workspace | What it supports |
| --- | --- |
| **Daily Food Entry** | Record prepared quantities, unserved leftovers, plate waste, meal, customer count, sell-outs and calendar context. |
| **Tomorrow's Plan** | Review item-level P50, P80 or P90 recommendations, reasons and confidence; accept the plan or record a manager override. |
| **Waste Analytics** | Explore waste quantity, rates, cost, trends, top-wasted items, meal and weekday patterns, and operational alerts. |
| **Menu and outlets** | Manage foods, units, batch sizes, costs, shelf life, outlets and organisation users. |
| **CSV workflows** | Preview imports with row-level validation and duplicate detection; export spreadsheet-safe records. |
| **Forecast evaluation** | Compare predictions with observed demand and baselines; report sold-out (censored) rows separately. |
| **Sustainability tools** | Track recommendations, weekly challenges and recorded donations. Environmental conversions are estimates based on stated assumptions. |

## Forecasting principles

WasteWise predicts demand rather than waste:

```text
consumed demand = quantity prepared - unserved leftover
```

Plate waste is tracked separately for portion insights. A sell-out means demand was at least the consumed quantity, so censored rows are kept out of ordinary error metrics. Features must be available before the prediction date. Baselines include same-weekday demand and rolling medians; a candidate model is promoted only when expanding-window backtests beat the best baseline. Cold-start estimates use configurable history thresholds. Recommendations round up to the item's batch size and do not subtract prior leftovers unless reuse is explicitly safe.

Explore [forecast decisions](docs/FORECASTS.md), [model evaluation](docs/ML.md) and [data provenance](docs/DATA.md).

## Run locally

### Requirements

- Node.js 24 (Node.js 22.12 or newer is supported by the package engine range)
- Python 3.12 for the ML service and Python checks
- Docker Desktop with Docker Compose

### Start the app

1. Clone this repository and copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Replace placeholder secrets in `.env` with unique random values of at least 32 characters. Keep `.env` local; Git ignores it. Configure an Atlas URI or keep the local Compose MongoDB URI from the example.
3. Install dependencies and start the services:

   ```powershell
   npm ci
   docker compose up -d --build
   npm run dev
   ```

4. Open the web app at [http://localhost:5173](http://localhost:5173). Express serves [http://localhost:5000/api/v1](http://localhost:5000/api/v1); the ML service is bound to loopback on port 8000.

The API requires MongoDB and has no in-memory persistence fallback. Workspace registration uses MongoDB transactions, so the local replica set must be initialized by the Compose setup. See [local deployment notes](docs/DEPLOYMENT.md).

## Configuration and checks

Use [.env.example](.env.example) for the available settings. Important variables include `MONGODB_URI`, `JWT_ACCESS_SECRET`, `CSRF_SECRET`, `CLIENT_ORIGIN`, `ML_SERVICE_URL`, `ML_INTERNAL_API_KEY`, `CRON_SECRET` and `TEST_MONGODB_URI`. The test URI must point to a separate disposable database; tests create and clean up their own records. Never add credentials to client code, screenshots, issues or commits. Use the hosting provider's secret store in deployed environments.

Run JavaScript checks:

```sh
npm run lint
npm test
npm run build
```

Run Python checks:

```sh
python -m pip install -r ml-service/requirements-dev.txt
python -m ruff check ml-service data
python -m pytest ml-service/tests data
```

GitHub Actions runs checks on pushes and pull requests. Database-independent tests can run without Atlas; MongoDB integration tests require `TEST_MONGODB_URI`.

## Deployment

The live app is hosted on Vercel with separate web, Express API and ML service projects, and MongoDB Atlas for application data. See [Vercel deployment details](docs/VERCEL_DEPLOYMENT.md) for the endpoints and operational considerations. Re-deploy after production code changes; local edits do not deploy by themselves.

## Security and data honesty

- Organisation-scoped queries and role checks protect tenant data.
- Passwords use Argon2id; access tokens are short-lived and refresh tokens rotate.
- CSRF protection, rate limits, secure cookies, request validation and CSV formula-injection protection are enabled.
- Demo values are illustrative. Synthetic records and sales benchmarks are not presented as real canteen outcomes.
- Keep secrets out of Git. The local `.env` is ignored; only the placeholder [.env.example](.env.example) belongs in source control.

## Contributing

Issues and pull requests are welcome. Include reproduction steps for bugs, avoid committing secrets or raw datasets, and run the relevant checks before opening a pull request. Data licenses and limitations are documented in [docs/DATA.md](docs/DATA.md).

## License

No open-source license has been selected yet. All rights are reserved unless a license is added to this repository.
