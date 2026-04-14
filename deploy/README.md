# MLabled — Deployment Guide

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌──────────────┐
│   Server 1      │     │   Server 2 (GPU)             │     │  Any machine │
│   Infrastructure│     │   Backend + Models            │     │  Frontend    │
│                 │     │                               │     │              │
│  ┌───────────┐  │     │  ┌──────────┐  ┌───────────┐ │     │  ┌────────┐  │
│  │ PostgreSQL│◄─┼─────┼──│ Backend  │  │ Qwen VL   │ │     │  │ Nginx  │  │
│  │ :5432     │  │     │  │ :8000    │  │ adapter   │ │     │  │ :3000  │──┼──► Users
│  └───────────┘  │     │  └──────────┘  │ :8501     │ │     │  └────┬───┘  │
│  ┌───────────┐  │     │  ┌──────────┐  └───────────┘ │     │       │      │
│  │ Redis     │◄─┼─────┼──│ Celery   │                │     │       ▼      │
│  │ :6379     │  │     │  │ worker   │  ┌───────────┐ │     │  proxy /api/ │
│  └───────────┘  │     │  └──────────┘  │ Qwen3-VL  │ │     │  → Server 2  │
│  ┌───────────┐  │     │               │ inference  │ │     └──────────────┘
│  │ MinIO     │◄─┼─────┼───────────────│ :8500      │ │
│  │ :9000     │  │     │               └───────────┘ │
│  │ :9001 web │  │     └─────────────────────────────┘
│  └───────────┘  │
└─────────────────┘
```

## Option 1: All-in-one (development)

```bash
cd mlabled/
docker compose up -d --build
```

Opens at http://localhost:3000. Login: admin@mlabled.local / admin

## Option 2: Distributed (production)

### Step 1: Infrastructure (Server 1)

```bash
cd deploy/infrastructure/
cp .env.example .env
# Edit .env — set passwords, ports
docker compose up -d
```

### Step 2: Backend + Models (Server 2, with GPU)

```bash
cd deploy/backend/
cp .env.example .env
# Edit .env — point POSTGRES_HOST, REDIS_HOST, MINIO_HOST to Server 1
docker compose up -d --build
```

Also deploy the Qwen3-VL inference server:
```bash
cd /path/to/qwen3-vl-inference/
cp .env.example .env
# Edit .env — MODEL_PATH=Qwen/Qwen3-VL-4B-Instruct
docker compose up -d
```

Then register the model adapter:
```bash
# From any machine, call the backend API:
curl -X POST http://server2:8000/api/models/register \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Qwen3-VL","url":"http://model-qwen-vl:8000"}'
```

### Step 3: Frontend (Any machine)

```bash
cd deploy/frontend/
cp .env.example .env
# Edit .env — BACKEND_URL=http://server2:8000
docker compose up -d --build
```

## Adding new model servers

1. Deploy the model API on any server (GPU recommended)
2. Create an adapter in `model_template/examples/` implementing the unified API
3. Register via `POST /api/models/register {"name": "...", "url": "http://..."}`

The adapter is a thin proxy — the actual model runs separately.
