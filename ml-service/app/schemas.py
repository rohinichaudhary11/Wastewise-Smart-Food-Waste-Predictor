from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ServiceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    item_id: str = Field(min_length=1, max_length=128)
    meal: Literal["breakfast", "lunch", "snacks", "dinner"]
    prepared: float = Field(ge=0)
    unserved_leftover: float = Field(ge=0)
    sold_out: bool = False
    holiday: bool = False
    exam: bool = False
    event: bool = False
    expected_customer_count: float | None = Field(default=None, ge=0)


class TrainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outlet_id: str = Field(min_length=1, max_length=128)
    records: list[ServiceRecord] = Field(min_length=1, max_length=100_000)


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outlet_id: str = Field(min_length=1, max_length=128)
    item_id: str = Field(min_length=1, max_length=128)
    meal: Literal["breakfast", "lunch", "snacks", "dinner"]
    prediction_date: date
    history: list[ServiceRecord] = Field(max_length=100_000)
    holiday: bool = False
    exam: bool = False
    event: bool = False
    expected_customer_count: float | None = Field(default=None, ge=0)
    manual_estimate: float | None = Field(default=None, ge=0)


class Prediction(BaseModel):
    p50: float | None
    p80: float | None
    p90: float | None
    method: str
    confidence: Literal["none", "low", "medium", "high"]
    model_version: str
    reasons: list[str]
