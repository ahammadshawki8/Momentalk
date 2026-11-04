# Momentalk live demo: one container serves the API, the built web app, and the demo moments.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
COPY frontend-dist /app/frontend-dist
COPY seed-data /app/seed-data

# Hugging Face Spaces run as a non root user; keep runtime data in a writable folder.
ENV MOMENTALK_DATA_DIR=/tmp/momentalk-data \
    MOMENTALK_FRONTEND_DIST=/app/frontend-dist \
    MOMENTALK_SEED_DIR=/app/seed-data \
    MOMENTALK_PUBLIC=1 \
    MOMENTALK_COST_CAP_USD=40 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers", "--forwarded-allow-ips", "*"]
