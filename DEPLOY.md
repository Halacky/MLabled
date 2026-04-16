# MLabled — Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Server A — UI & Backend                            │
│  ┌───────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ Frontend  │→ │ Backend   │→ │ Celery Worker  │  │
│  │ :3000     │  │ :8010     │  │                │  │
│  └───────────┘  └─────┬─────┘  └────────────────┘  │
│                       │                              │
└───────────────────────┼──────────────────────────────┘
                        │
          ┌─────────────┼─────────────────┐
          ▼             ▼                 ▼
   ┌────────────┐ ┌──────────┐  ┌──────────────────┐
   │ PostgreSQL │ │  MinIO   │  │  Redis           │
   │ (external) │ │(external)│  │  (external)      │
   └────────────┘ └──────────┘  └──────────────────┘

   ┌──────────────────────────────────────────────────┐
   │  Server B — Model Servers (optional)             │
   │  ┌─────────────┐  ┌──────────────────┐           │
   │  │ Qwen3-VL    │  │ YOLO / SAM / ... │           │
   │  │ :8000       │  │ :8001            │           │
   │  └─────────────┘  └──────────────────┘           │
   └──────────────────────────────────────────────────┘

   ┌──────────────────┐
   │  Host C — Browser │
   │  http://A:3000    │
   └──────────────────┘
```

## Prerequisites

- Docker + Docker Compose on Server A
- External PostgreSQL (14+)
- External Redis (6+)
- External MinIO or S3-compatible storage
- (Optional) GPU server for AI models

## Quick Start

### 1. Clone

```bash
git clone <repo-url> mlabled
cd mlabled
```

### 2. Configure

```bash
cp .env.example .env
nano .env
```

```env
# ── Database ──
# Create database first: CREATE DATABASE mlabled;
DATABASE_URL=postgresql+asyncpg://user:password@db-host:5432/mlabled

# ── Redis ──
# Without password:
REDIS_URL=redis://redis-host:6379/0
# With password:
REDIS_URL=redis://:yourpassword@redis-host:6379/0

# ── MinIO / S3 ──
S3_ENDPOINT=http://minio-host:9000
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_BUCKET=mlabled

# MinIO console URL (for "Browse in MinIO" buttons in UI)
# Leave empty if not using MinIO console
MINIO_CONSOLE_URL=http://minio-host:9001

# ── App ──
SECRET_KEY=run-openssl-rand-hex-32-and-paste-here
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=strong-password

# ── Ports (optional) ──
# FRONTEND_PORT=3000
# BACKEND_PORT=8010
```

### 3. Deploy

```bash
docker compose up -d --build
```

### 4. Verify

```bash
# Check all services
docker compose ps

# Check backend health
curl http://localhost:8010/api/health
# → {"status":"ok"}

# Check frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# → 200
```

### 5. Open in browser

```
http://<server-a-ip>:3000
```

Login: credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`

---

## What Happens on First Start

1. Backend waits for PostgreSQL to be ready (up to 60 seconds)
2. Alembic runs migrations — creates all tables automatically
3. Admin user is created (skipped if already exists)
4. MinIO bucket is created if it doesn't exist
5. Backend + Celery Worker + Frontend start

---

## Connecting AI Models

Models run separately from the main stack. After a model server is running:

1. Go to **Models** page in the UI
2. Click **Register Model**
3. Enter name and URL (e.g. `http://192.168.1.20:8000`)
4. The system fetches model info automatically (supported tasks, classes)

### Example: Qwen3-VL on GPU Server

```bash
# On Server B (with GPU)
git clone https://github.com/rpol-recart/qwen3-vl-inference.git
cd qwen3-vl-inference

cp .env.example .env
# Edit .env:
#   MODEL_PATH=Qwen/Qwen3-VL-4B-Instruct   (for 12GB GPU)
#   GPU_MEMORY_UTILIZATION=0.90

docker compose up -d --build
```

Then register in MLabled UI:
- Name: `Qwen3-VL`
- URL: `http://<server-b-ip>:8000`

### Example: Custom YOLO Model

```bash
# On Server B
cd mlabled/model_template
docker build -t my-yolo -f examples/yolo/Dockerfile .
docker run -d --gpus all -p 8001:8000 my-yolo
```

Register: URL `http://<server-b-ip>:8001`

### Adapter Pattern

Models don't need to run inside MLabled. Any HTTP server implementing this API works:

```
GET  /health       → {"status": "ready"}
GET  /info         → {"name": "...", "supported_tasks": [...], "class_type": "fixed"|"open", "labels": [...]}
POST /predict      → {"image": "<base64>", "params": {...}} → {"annotations": [...]}
```

See `model_template/base/` for the full specification.

---

## MinIO Storage Structure

```
bucket/
└── projects/
    └── <project-name>/
        └── <task-name>/
            ├── images/           ← uploaded images
            │   ├── photo1.jpg
            │   └── photo2.jpg
            └── annotations/      ← after "Sync to MinIO"
                ├── YOLO/
                │   ├── classes.txt
                │   └── labels/
                │       ├── photo1.txt
                │       └── photo2.txt
                └── CVAT/
                    └── annotations.xml
```

---

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (asyncpg) |
| `REDIS_URL` | Yes | — | Redis connection string |
| `S3_ENDPOINT` | Yes | — | MinIO/S3 endpoint URL |
| `S3_ACCESS_KEY` | Yes | — | S3 access key |
| `S3_SECRET_KEY` | Yes | — | S3 secret key |
| `S3_BUCKET` | No | `mlabled` | Default bucket name |
| `MINIO_CONSOLE_URL` | No | — | MinIO console URL for UI links |
| `SECRET_KEY` | No | `change-me` | JWT signing key |
| `ADMIN_EMAIL` | No | `admin@mlabled.local` | Initial admin email |
| `ADMIN_PASSWORD` | No | `admin` | Initial admin password |
| `FRONTEND_PORT` | No | `3000` | Frontend port on host |
| `BACKEND_PORT` | No | `8010` | Backend API port on host |

---

## Updating

```bash
git pull
docker compose up -d --build
# Migrations run automatically on start
```

## Backup

- **Database**: standard `pg_dump`
- **Images & annotations**: stored in MinIO — use `mc mirror` or MinIO's built-in replication
- **No local volumes**: the compose doesn't use Docker volumes

## Troubleshooting

```bash
# View logs
docker compose logs backend
docker compose logs celery-worker

# Restart
docker compose restart backend

# Full rebuild
docker compose down
docker compose up -d --build
```

### Common issues

| Problem | Solution |
|---|---|
| `Name or service not known` | Check that `host.docker.internal` resolves — `extra_hosts` is set in compose |
| `connection refused` to database | Ensure PostgreSQL allows connections from Docker network (check `pg_hba.conf`) |
| Images don't load (401) | Check that the token is valid — try logging out and back in |
| Model registration fails (502) | Ensure Server B is reachable from Server A's Docker network |
