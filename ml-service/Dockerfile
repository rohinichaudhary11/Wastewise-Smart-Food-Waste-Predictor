FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MODEL_DIR=/app/models
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-runtime-lock.txt ./requirements-runtime-lock.txt
RUN pip install --no-cache-dir -r requirements-runtime-lock.txt
COPY app ./app
RUN useradd --system --uid 10001 mlservice && mkdir -p /app/models && chown -R mlservice:mlservice /app
USER mlservice
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
