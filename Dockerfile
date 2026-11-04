# Momentalk live demo: one container serves the API, the built web app, and the demo moments.
# Builds straight from the GitHub repo (Render, or any Docker host).

FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx vite build

FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY backend /app/backend
COPY --from=web /web/dist /app/frontend-dist
COPY deploy/seed-data /app/seed-data

ENV MOMENTALK_DATA_DIR=/tmp/momentalk-data \
    MOMENTALK_FRONTEND_DIST=/app/frontend-dist \
    MOMENTALK_SEED_DIR=/app/seed-data \
    MOMENTALK_PUBLIC=1 \
    MOMENTALK_COST_CAP_USD=40 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend
EXPOSE 10000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips '*'"]
