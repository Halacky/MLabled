FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["sh", "-c", "\
  echo 'Waiting for database...' && \
  for i in $(seq 1 30); do \
    python -c 'import asyncio,asyncpg,os; asyncio.run(asyncpg.connect(dsn=os.environ[\"DATABASE_URL\"].replace(\"+asyncpg\",\"\")))' 2>/dev/null && break; \
    echo \"  attempt $i/30...\"; sleep 2; \
  done && \
  alembic upgrade head && \
  python scripts/create_admin.py && \
  uvicorn app.main:app --host 0.0.0.0 --port 8000"]
