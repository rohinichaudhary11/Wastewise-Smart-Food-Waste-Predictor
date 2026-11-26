import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from app.forecasting import model_metadata, predict, train_outlet
from app.schemas import PredictRequest, TrainRequest

app = FastAPI(title="WasteWise ML Service", version="1.0.0", docs_url=None, redoc_url=None)


def require_internal_key(value: str | None = Header(default=None, alias="X-Internal-API-Key")):
    expected = os.getenv("ML_INTERNAL_API_KEY", "")
    if not expected or not value or not hmac.compare_digest(value, expected):
        raise HTTPException(status_code=401, detail="Internal service authentication failed.")


@app.get("/health")
def health():
    return {"status": "ok", "service": "wastewise-ml"}


@app.post("/train", dependencies=[Depends(require_internal_key)])
def train(payload: TrainRequest):
    try:
        result = train_outlet(payload)
        return {"data": result}
    except Exception as error:
        raise HTTPException(status_code=422, detail="Model training failed. Check the submitted outlet history and service logs.") from error


@app.post("/predict", dependencies=[Depends(require_internal_key)])
def get_prediction(payload: PredictRequest):
    try:
        result = predict(payload)
        return {"data": result}
    except Exception as error:
        raise HTTPException(status_code=422, detail="Prediction could not be computed from the submitted history.") from error


@app.get("/models/{outlet_id}", dependencies=[Depends(require_internal_key)])
def get_models(outlet_id: str):
    return {"data": model_metadata(outlet_id)}


@app.exception_handler(Exception)
async def internal_error_handler(_request, _exception):
    return JSONResponse(status_code=500, content={"error": {"code": "ML_INTERNAL_ERROR", "message": "The model service could not complete the request."}})
