from datetime import date, timedelta

import anyio
from app.main import app
from httpx import ASGITransport, AsyncClient

KEY = {"X-Internal-API-Key": "test-only-internal-key"}


def api(method, path, **kwargs):
    async def send_request():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return anyio.run(send_request)


def _records(count=36):
    start = date(2025, 1, 1)
    records = []
    for offset in range(count):
        demand = 42 + (offset % 7) * 3 + (offset // 7) % 3
        records.append({
            "date": (start + timedelta(days=offset)).isoformat(), "item_id": "rice-id", "meal": "lunch",
            "prepared": demand + 8, "unserved_leftover": 8, "sold_out": offset in {8, 21},
            "holiday": False, "exam": offset in {15, 16}, "event": False,
        })
    return records


def test_health_is_public_and_mutating_model_api_requires_internal_key(monkeypatch):
    monkeypatch.setenv("ML_INTERNAL_API_KEY", "test-only-internal-key")
    assert api("GET", "/health").json() == {"status": "ok", "service": "wastewise-ml"}
    response = api("POST", "/train", json={"outlet_id": "outlet-a", "records": _records()})
    assert response.status_code == 401


def test_train_registers_model_metadata_and_prediction_uses_model_or_baseline(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_INTERNAL_API_KEY", "test-only-internal-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    trained = api("POST", "/train", headers=KEY, json={"outlet_id": "outlet-a", "records": _records()})
    assert trained.status_code == 200
    manifest = trained.json()["data"]
    assert manifest["row_count"] == 36
    assert manifest["data_start"] == "2025-01-01"
    assert manifest["data_end"] == "2025-02-05"
    assert "lightgbm_quantiles" in manifest["entries"][0]["candidates"]
    registry = api("GET", "/models/outlet-a", headers=KEY)
    assert registry.status_code == 200
    assert registry.json()["data"]["model"]["model_version"] == manifest["model_version"]
    prediction = api("POST", "/predict", headers=KEY, json={
        "outlet_id": "outlet-a", "item_id": "rice-id", "meal": "lunch", "prediction_date": "2025-02-06",
        "history": _records(), "expected_customer_count": 80,
    })
    assert prediction.status_code == 200
    result = prediction.json()["data"]
    assert result["p50"] >= 0
    assert result["p50"] <= result["p80"] <= result["p90"]
    assert result["confidence"] in {"low", "medium", "high"}


def test_cold_start_uses_manager_estimate_and_censored_rows_are_not_training_targets(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_INTERNAL_API_KEY", "test-only-internal-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    cold = api("POST", "/predict", headers=KEY, json={
        "outlet_id": "outlet-b", "item_id": "new-item", "meal": "dinner", "prediction_date": "2025-01-08",
        "history": _records(6), "manual_estimate": 25,
    })
    assert cold.status_code == 200
    assert cold.json()["data"]["p50"] == 25
    assert cold.json()["data"]["confidence"] == "none"
    trained = api("POST", "/train", headers=KEY, json={"outlet_id": "outlet-c", "records": _records()})
    entry = trained.json()["data"]["entries"][0]
    assert entry["row_count"] == 36
    assert entry["uncensored_row_count"] == 34
    assert entry["censored_row_count"] == 2


def test_censored_services_do_not_count_toward_cold_start_threshold(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_INTERNAL_API_KEY", "test-only-internal-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    history = _records(8)
    for record in history[:7]:
        record["sold_out"] = True
    response = api("POST", "/predict", headers=KEY, json={
        "outlet_id": "outlet-censored", "item_id": "rice-id", "meal": "lunch",
        "prediction_date": "2025-01-09", "history": history, "manual_estimate": 31,
    })
    assert response.status_code == 200
    assert response.json()["data"] == {
        "p50": 31, "p80": 31, "p90": 31, "method": "manual_estimate",
        "confidence": "none", "model_version": "manual-estimate",
        "reasons": ["Manager estimate used because fewer than 7 uncensored records are available."],
    }


def test_seven_to_twenty_seven_records_stay_on_low_confidence_baseline(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_INTERNAL_API_KEY", "test-only-internal-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    response = api("POST", "/predict", headers=KEY, json={
        "outlet_id": "outlet-d", "item_id": "rice-id", "meal": "lunch", "prediction_date": "2025-01-15",
        "history": _records(14),
    })
    assert response.status_code == 200
    result = response.json()["data"]
    assert result["confidence"] == "low"
    assert result["model_version"] == "baseline-v1"
    assert result["p50"] <= result["p80"] <= result["p90"]
