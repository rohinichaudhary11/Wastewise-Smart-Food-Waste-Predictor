# Tomorrow's Plan and forecast accuracy

## Generate a plan

The web client calls the Express API. It never calls the ML service directly. Use `POST /api/v1/forecasts/generate` with an outlet, future service date, optional meal, and service level:

```json
{
  "outletId": "<outlet ObjectId>",
  "date": "YYYY-MM-DD",
  "meal": "lunch",
  "serviceLevel": "balanced"
}
```

Omit `date` to plan for tomorrow in the outlet's time zone. Omit `meal` to plan all four meals. `low_waste`, `balanced`, and `avoid_sell_out` select P50, P80, and P90 respectively; balanced is the default. The selected demand is rounded up to the menu item's batch size. Reusable leftovers are shown as menu context and are not subtracted from the recommendation.

Express sends only prior service records, historical calendar context, expected attendance estimated from earlier same-weekday services, and the menu item's meal-specific manager estimate. The demand target is prepared minus unserved leftovers; plate waste is not used to lower demand. Sold-out records are excluded from demand baselines and model fitting, but their flags remain available for sell-out-rate features. A live service failure returns a labelled baseline fallback. Under seven uncensored records, a manager estimate is required; it can be saved with `PATCH /api/v1/menu-items/:itemId/manual-estimate` and a `meal` plus nonnegative `quantity`.

The saved `Forecast` records contain the submitted history/features, calendar flags, attendance estimate, batch size, selected service level, quantiles, baseline, model version, and recommendation. Managers and admins can accept the recommendation or override it with a note using `PATCH /api/v1/forecasts/:forecastId/decision`. Staff can view and generate plans but cannot decide or override them.

## Accuracy

`GET /api/v1/forecasts/accuracy?outletId=...&from=YYYY-MM-DD&to=YYYY-MM-DD` joins saved forecasts with the corresponding daily service records. Actual demand is `prepared - unservedLeftover`. Plate waste is excluded from demand. Sell-out rows are censored lower bounds and are displayed/count separately; they are excluded from MAE, WAPE, bias, and baseline MAE.

The comparison uses each saved forecast's P50 demand and the same-date baseline P50 captured during planning. Metrics are shown only when an actual daily log exists. Forecasts without an actual are counted as awaiting actuals. Per-item output includes scored count, error metrics, censored count and model version(s). These measurements are historical for the selected outlet and period; they are not a promise of future performance. Synthetic demo data remains labelled synthetic and must not be represented as measured production accuracy.
