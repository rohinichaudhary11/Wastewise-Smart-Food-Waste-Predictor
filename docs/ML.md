# ML service and training

The FastAPI service is an internal dependency: only the Express API calls it with `X-Internal-API-Key`. In production, do not publish its port. `POST /api/v1/model-runs/:outletId/train` loads logs and calendar context after checking the outlet belongs to the signed-in user's organisation. Production ML receives those rows only. `POST /train`, `POST /predict`, and `GET /models/{outletId}` are the internal service endpoints; `GET /health` is an unauthenticated liveness check.

The training target is `prepared - unserved_leftover`. Rows marked sold out are censored (their demand is a lower bound), so they are excluded from model fitting and error metrics, retained in the service history for sell-out-rate features, and counted separately in per-group training metadata. Plate waste is not part of the demand target. Expected customer count is estimated from prior service attendance for the same meal and weekday when available; same-day actual attendance is never sent as a prediction feature. Calendar context flags come from saved events.

Models are fit separately for each outlet/item/meal group. Under 7 uncensored records requires a manager estimate and returns no confidence; 7–27 uncensored records use a recent/same-weekday median with low confidence; at 28 or more records, Ridge, Random Forest and LightGBM point and quantile candidates are evaluated against same-weekday and rolling-median baselines. Validation uses chronological expanding windows (`TimeSeriesSplit`), never a shuffled split. A candidate is retained only when its aggregate validation MAE is strictly lower than the best baseline MAE. Otherwise predictions keep the baseline. Quantile LightGBM models estimate P50/P80/P90; predictions are constrained to nondecreasing quantiles. The starting thresholds are configurable with `MIN_BASELINE_RECORDS` and `MIN_MODEL_RECORDS`. Tomorrow's Plan selects P50/P80/P90 by service level and rounds the chosen demand upward to the menu item's batch size.

Metrics include MAE, WAPE, signed bias, per-quantile pinball loss and P50–P90 interval coverage when enough expanding-window folds exist. Censored rows are reported in `row_count` and `uncensored_row_count` separately. Confidence for promoted models is based on backtest MAE improvement; baseline/cold-start confidence stays low or none. Metrics describe each outlet's own historical validation only; they are not a guarantee of future accuracy.

The model service writes versioned manifests and joblib artifacts to the persistent `wastewise-models` volume. The outlet directory is derived from a one-way hash of the outlet ID. Artifacts are created only by the service and are never accepted from users. Registry manifests include UTC training time, data range, row counts, candidate and baseline metrics, per-group promotion, confidence and artifact metadata. The Express server stores a corresponding `ModelRun` scoped to the organisation and outlet. Training is available on demand to admin/manager roles and scheduled weekly while the API process is running; a stopped API does not run scheduled work.

## Benchmark use

`data/prepare_benchmarks.py` only converts an operator-selected local CSV into date/item sales aggregates. It is for pipeline experiments and is not connected to the production training route. No source dataset was downloaded as part of this phase. See [DATA.md](./DATA.md) for the license review and manual prerequisites. The French bakery and optional food-order Kaggle licenses could not be verified from their page metadata, so those downloads remain blocked pending manual license review. The Stuttgart Mendeley dataset page lists CC BY 4.0; attribute Fabian Taigel and DOI `10.17632/xv5kp6mxv7.1` when using it.

## References

- [scikit-learn expanding-window `TimeSeriesSplit`](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)
- [scikit-learn quantile regression example](https://scikit-learn.org/stable/auto_examples/applications/plot_time_series_lagged_features.html)
- [FastAPI API key header security reference](https://fastapi.tiangolo.com/reference/security/)
- [LightGBM quantile objective](https://lightgbm.readthedocs.io/en/latest/Parameters.html#objective)
