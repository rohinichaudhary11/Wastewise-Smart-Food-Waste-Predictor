import hashlib
import json
import os
import shutil
import tempfile
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import uuid4

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import TimeSeriesSplit
from app.model_store import persist_outlet, restore_outlet

FEATURES = [
    "weekday", "month", "day_of_month", "holiday", "exam", "event",
    "expected_customer_count", "lag_previous", "lag_same_weekday",
    "rolling_mean_7", "rolling_median_7", "rolling_mean_28",
    "rolling_median_28", "sellout_rate_28",
]
MIN_RECORDS = int(os.getenv("MIN_MODEL_RECORDS", "28"))
LOWER_RECORDS = int(os.getenv("MIN_BASELINE_RECORDS", "7"))


def _get(record, field, default=None):
    if isinstance(record, dict):
        return record.get(field, default)
    return getattr(record, field, default)


def _day(value):
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def _key(outlet_id):
    return hashlib.sha256(outlet_id.encode("utf-8")).hexdigest()


def model_root() -> Path:
    default = "/tmp/wastewise-models" if os.getenv("VERCEL") else str(Path(__file__).resolve().parents[1] / "models")
    root = Path(os.getenv("MODEL_DIR", default))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _features_before(records, target_date, holiday=False, exam=False, event=False, expected=None):
    observations = []
    sold_out_flags = []
    for record in sorted(records, key=lambda row: _day(_get(row, "date"))):
        record_date = _day(_get(record, "date"))
        if record_date >= target_date:
            continue
        sold = bool(_get(record, "sold_out", False))
        sold_out_flags.append(sold)
        if not sold:
            observations.append((record_date, max(0.0, float(_get(record, "prepared")) - float(_get(record, "unserved_leftover")))))
    prior = [value for _, value in observations]
    same_weekday = [value for record_date, value in observations if (target_date - record_date).days % 7 == 0]
    recent7 = prior[-7:]
    recent28 = prior[-28:]
    safe_mean = lambda values: float(np.mean(values)) if values else 0.0
    safe_median = lambda values: float(np.median(values)) if values else 0.0
    return {
        "weekday": target_date.weekday(), "month": target_date.month, "day_of_month": target_date.day,
        "holiday": int(holiday), "exam": int(exam), "event": int(event),
        "expected_customer_count": float(expected or 0),
        "lag_previous": prior[-1] if prior else 0.0,
        "lag_same_weekday": same_weekday[-1] if same_weekday else 0.0,
        "rolling_mean_7": safe_mean(recent7), "rolling_median_7": safe_median(recent7),
        "rolling_mean_28": safe_mean(recent28), "rolling_median_28": safe_median(recent28),
        "sellout_rate_28": float(np.mean(sold_out_flags[-28:])) if sold_out_flags else 0.0,
    }


def _training_frame(records):
    samples = []
    ordered = sorted(records, key=lambda row: _day(_get(row, "date")))
    for record in ordered:
        record_date = _day(_get(record, "date"))
        values = _features_before(
            ordered, record_date, _get(record, "holiday", False),
            _get(record, "exam", False), _get(record, "event", False),
            _get(record, "expected_customer_count"),
        )
        values["target"] = max(0.0, float(_get(record, "prepared")) - float(_get(record, "unserved_leftover")))
        values["date"] = record_date.isoformat()
        values["censored"] = bool(_get(record, "sold_out", False))
        samples.append(values)
    frame = pd.DataFrame(samples)
    if frame.empty:
        return frame
    return frame.loc[~frame["censored"]].reset_index(drop=True)


def baseline_value(records, target_date):
    clean = [row for row in records if not bool(_get(row, "sold_out", False)) and _day(_get(row, "date")) < target_date]
    demands = [(row, max(0.0, float(_get(row, "prepared")) - float(_get(row, "unserved_leftover")))) for row in clean]
    exact = [demand for row, demand in demands if (target_date - _day(_get(row, "date"))).days == 7]
    if exact:
        return float(np.median(exact)), "last_same_weekday"
    same_weekday = [demand for row, demand in demands if _day(_get(row, "date")).weekday() == target_date.weekday()]
    if same_weekday:
        return float(np.median(same_weekday[-4:])), "same_weekday_median"
    recent = [demand for _, demand in demands[-7:]]
    if recent:
        return float(np.median(recent)), "rolling_median"
    return None, "no_observed_demand"


def _metrics(actual, predicted):
    y = np.asarray(actual, dtype=float)
    p = np.maximum(0.0, np.asarray(predicted, dtype=float))
    denominator = float(np.sum(np.abs(y)))
    return {"mae": float(mean_absolute_error(y, p)), "wape": float(np.sum(np.abs(y - p)) / denominator) if denominator else None, "bias": float(np.mean(p - y))}


def _pinball(actual, predicted, alpha):
    errors = np.asarray(actual, dtype=float) - np.asarray(predicted, dtype=float)
    return float(np.mean(np.maximum(alpha * errors, (alpha - 1) * errors)))


def _estimators():
    return {
        "ridge": Ridge(alpha=1.0),
        "random_forest": RandomForestRegressor(n_estimators=80, min_samples_leaf=2, max_features=1.0, random_state=41, n_jobs=1),
        "lightgbm": LGBMRegressor(objective="regression", n_estimators=100, learning_rate=0.04, num_leaves=7, min_child_samples=5, verbosity=-1, random_state=41, n_jobs=1),
    }


def _expanding_evaluation(frame):
    if len(frame) < 10:
        return {}, None
    x = frame[FEATURES].to_numpy(dtype=float)
    y = frame["target"].to_numpy(dtype=float)
    splits = min(3, max(2, len(frame) // 8))
    splitter = TimeSeriesSplit(n_splits=splits)
    predictions = {name: [] for name in [*_estimators(), "rolling_median", "last_same_weekday"]}
    actuals = []
    interval_predictions = []
    for train_idx, test_idx in splitter.split(x):
        if len(train_idx) < 5:
            continue
        for name, estimator in _estimators().items():
            estimator.fit(x[train_idx], y[train_idx])
            predictions[name].extend(np.maximum(0, estimator.predict(x[test_idx])).tolist())
        for alpha in (0.5, 0.8, 0.9):
            quantile = LGBMRegressor(objective="quantile", alpha=alpha, n_estimators=100, learning_rate=0.04, num_leaves=7, min_child_samples=5, verbosity=-1, random_state=41, n_jobs=1)
            quantile.fit(x[train_idx], y[train_idx])
            interval_predictions.append((alpha, test_idx, np.maximum(0, quantile.predict(x[test_idx]))))
        for index in test_idx:
            row = frame.iloc[index]
            date_value = date.fromisoformat(row["date"])
            history = [{"date": frame.iloc[j]["date"], "prepared": frame.iloc[j]["target"], "unserved_leftover": 0, "sold_out": False} for j in range(index)]
            value, _ = baseline_value(history, date_value)
            predictions["rolling_median"].append(max(0.0, float(row["rolling_median_28"])))
            predictions["last_same_weekday"].append(float(row["lag_same_weekday"]) if row["lag_same_weekday"] else (value or 0.0))
            actuals.append(float(row["target"]))
    count = len(actuals)
    if not count:
        return {}, None
    candidates = {name: _metrics(actuals, values) for name, values in predictions.items() if len(values) == count}
    baseline_name = min(("last_same_weekday", "rolling_median"), key=lambda name: candidates.get(name, {}).get("mae", float("inf")))
    quantiles = {alpha: [] for alpha in (0.5, 0.8, 0.9)}
    for alpha, test_idx, values in interval_predictions:
        quantiles[alpha].extend(values.tolist())
    if all(len(values) == count for values in quantiles.values()):
        p50, p80, p90 = [np.maximum.accumulate(quantiles[alpha]) for alpha in (0.5, 0.8, 0.9)]
        candidates["lightgbm_quantiles"] = {
            **_metrics(actuals, p50),
            "pinball_p50": _pinball(actuals, p50, .5),
            "pinball_p80": _pinball(actuals, p80, .8),
            "pinball_p90": _pinball(actuals, p90, .9),
            "interval_coverage_p50_p90": float(np.mean((np.asarray(actuals) >= p50) & (np.asarray(actuals) <= p90))),
        }
    return candidates, baseline_name


def _model_file(outlet_hash, version, item_id, meal):
    group = hashlib.sha256(f"{item_id}|{meal}".encode()).hexdigest()
    return f"{outlet_hash}-{version}-{group}.joblib"


def train_outlet(request):
    outlet_id = _get(request, "outlet_id")
    records = _get(request, "records", [])
    groups = {}
    for row in records:
        key = (str(_get(row, "item_id")), str(_get(row, "meal")))
        groups.setdefault(key, []).append(row)
    version = f"ww-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    outlet_hash = _key(str(outlet_id))
    root = model_root()
    restore_outlet(root, outlet_hash, force=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{outlet_hash}-", dir=root))
    entries = []
    try:
        for (item_id, meal), group in sorted(groups.items()):
            group.sort(key=lambda row: _day(_get(row, "date")))
            frame = _training_frame(group)
            all_dates = [_day(_get(row, "date")) for row in group]
            row_count = len(group)
            score, baseline_name = _expanding_evaluation(frame) if len(frame) >= LOWER_RECORDS else ({}, None)
            candidate_names = [name for name in [*_estimators(), "lightgbm_quantiles"] if name in score]
            winning = min(candidate_names, key=lambda name: score[name]["mae"]) if candidate_names else None
            baseline_metrics = score.get(baseline_name, {}) if baseline_name else {}
            promoted = bool(winning and baseline_metrics.get("mae") is not None and score[winning]["mae"] < baseline_metrics["mae"])
            entry = {"item_id": item_id, "meal": meal, "row_count": row_count, "uncensored_row_count": len(frame), "censored_row_count": row_count - len(frame), "data_start": min(all_dates).isoformat(), "data_end": max(all_dates).isoformat(), "method": winning if promoted else baseline_name or "baseline", "promoted": promoted, "metrics": score.get(winning, {}) if promoted else baseline_metrics, "baseline_metrics": baseline_metrics, "candidates": score}
            if len(frame) >= MIN_RECORDS:
                x = frame[FEATURES].to_numpy(dtype=float); y = frame["target"].to_numpy(dtype=float)
                if promoted:
                    chosen = None if winning == "lightgbm_quantiles" else _estimators()[winning].fit(x, y)
                    quantile_models = {}
                    for alpha in (.5, .8, .9):
                        quantile = LGBMRegressor(objective="quantile", alpha=alpha, n_estimators=100, learning_rate=.04, num_leaves=7, min_child_samples=5, verbosity=-1, random_state=41, n_jobs=1)
                        quantile.fit(x, y)
                        quantile_models[str(alpha)] = quantile
                    artifact = {"point_model": chosen, "quantile_models": quantile_models, "method": winning}
                    artifact_path = _model_file(outlet_hash, version, item_id, meal)
                    joblib.dump(artifact, stage / artifact_path, compress=3)
                    entry["artifact"] = artifact_path
                    entry["confidence"] = "high" if score[winning]["mae"] <= baseline_metrics["mae"] * .8 else "medium"
                else:
                    entry["confidence"] = "low"
            else:
                entry["confidence"] = "low" if len(frame) >= LOWER_RECORDS else "none"
            entries.append(entry)
        manifest = {"outlet_id": str(outlet_id), "model_version": version, "trained_at": datetime.now(UTC).isoformat(), "data_start": min(e["data_start"] for e in entries), "data_end": max(e["data_end"] for e in entries), "row_count": len(records), "entries": entries}
        (stage / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
        destination = root / f"{outlet_hash}-{version}"
        stage.replace(destination)
        active = root / f"{outlet_hash}-active.json"
        tmp_active = active.with_suffix(".tmp")
        tmp_active.write_text(json.dumps({"directory": destination.name, "model_version": version}), encoding="utf-8")
        tmp_active.replace(active)
        persist_outlet(root, outlet_hash)
        return {key: value for key, value in manifest.items() if key != "entries"} | {"entries": entries}
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def model_metadata(outlet_id):
    outlet_hash = _key(outlet_id)
    root = model_root()
    restore_outlet(root, outlet_hash)
    active = root / f"{outlet_hash}-active.json"
    if not active.is_file():
        return {"outlet_id": outlet_id, "model": None, "history": []}
    pointer = json.loads(active.read_text(encoding="utf-8"))
    manifest_path = root / pointer["directory"] / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    history = []
    for path in root.glob(f"{outlet_hash}-ww-*"):
        candidate = path / "manifest.json"
        if candidate.is_file():
            history.append(json.loads(candidate.read_text(encoding="utf-8")))
    history.sort(key=lambda item: item["trained_at"], reverse=True)
    return {"outlet_id": outlet_id, "model": manifest, "history": history[:20]}


def predict(request):
    outlet_id = str(_get(request, "outlet_id"))
    item_id = str(_get(request, "item_id"))
    meal = str(_get(request, "meal"))
    target_date = _day(_get(request, "prediction_date"))
    history = [_get(request, "history", [])][0]
    matching = [row for row in history if str(_get(row, "item_id")) == item_id and str(_get(row, "meal")) == meal and _day(_get(row, "date")) < target_date]
    matching.sort(key=lambda row: _day(_get(row, "date")))
    clean = [row for row in matching if not bool(_get(row, "sold_out", False))]
    demands = [max(0.0, float(_get(row, "prepared")) - float(_get(row, "unserved_leftover"))) for row in clean]
    if len(clean) < LOWER_RECORDS:
        estimate = _get(request, "manual_estimate")
        model_version = "manual-estimate" if estimate is not None else "insufficient-history"
        reason = f"Manager estimate used because fewer than {LOWER_RECORDS} uncensored records are available." if estimate is not None else f"Fewer than {LOWER_RECORDS} uncensored records are available; enter a manager estimate."
        value = float(estimate) if estimate is not None else None
        return {"p50": value, "p80": value, "p90": value, "method": "manual_estimate", "confidence": "none", "model_version": model_version, "reasons": [reason]}
    if len(clean) < MIN_RECORDS:
        center, method = baseline_value(clean, target_date)
        if center is None:
            return {"p50": None, "p80": None, "p90": None, "method": method, "confidence": "low", "model_version": "baseline-v1", "reasons": ["No uncensored demand history is available for this service."]}
        p80, p90 = np.quantile(demands, [.8, .9]) if demands else (center, center)
        return {"p50": center, "p80": max(center, float(p80)), "p90": max(center, float(p90)), "method": method, "confidence": "low", "model_version": "baseline-v1", "reasons": [f"Median demand from {len(clean)} uncensored prior services; the trained-model threshold is {MIN_RECORDS}."]}
    metadata = model_metadata(outlet_id)
    manifest = metadata.get("model")
    entry = next((row for row in manifest.get("entries", []) if row["item_id"] == item_id and row["meal"] == meal), None) if manifest else None
    if entry and entry.get("promoted") and entry.get("artifact"):
        pointer = json.loads((model_root() / f"{_key(outlet_id)}-active.json").read_text(encoding="utf-8"))
        artifact = joblib.load(model_root() / pointer["directory"] / entry["artifact"])
        features = _features_before(matching, target_date, _get(request, "holiday", False), _get(request, "exam", False), _get(request, "event", False), _get(request, "expected_customer_count"))
        row = pd.DataFrame([features], columns=FEATURES)
        quantiles = [max(0.0, float(artifact["quantile_models"][str(alpha)].predict(row)[0])) for alpha in (.5, .8, .9)]
        quantiles = np.maximum.accumulate(quantiles).tolist()
        return {"p50": quantiles[0], "p80": quantiles[1], "p90": quantiles[2], "method": entry["method"], "confidence": entry["confidence"], "model_version": manifest["model_version"], "reasons": [f"Trained on {entry['uncensored_row_count']} uncensored service records; the candidate beat the {entry['baseline_metrics'].get('mae', 0):.2f} MAE baseline in expanding-window backtests."]}
    center, method = baseline_value(clean, target_date)
    return {"p50": center, "p80": max(center, float(np.quantile(demands, .8))), "p90": max(center, float(np.quantile(demands, .9))), "method": method, "confidence": "low", "model_version": manifest["model_version"] if manifest else "baseline-v1", "reasons": ["The trained candidate did not beat the best expanding-window baseline; baseline recommendation retained."]}
