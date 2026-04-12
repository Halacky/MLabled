# MLabled

Self-hosted image annotation platform with AI model integration.

## Features

- **Annotation tools**: BBox, Polygon, Points, Brush/Mask
- **AI-assisted labeling**: Connect any model via unified API adapters
- **Open-vocabulary detection**: Qwen3-VL integration (describe what to find in text)
- **Fixed-class detection**: YOLO integration with class filtering
- **Model modes**: Manual (click to run) / Semi-auto (auto-run on empty images)
- **Review workflow**: Annotator → Reviewer → Accept/Reject pipeline
- **Export**: YOLO, CVAT XML formats — with or without images
- **MinIO storage**: Images + annotations stored in S3-compatible storage, browsable via MinIO Console
- **Keyboard shortcuts**: CVAT-style hotkeys (N, D/F, V, B, P, Ctrl+S, Ctrl+Z, etc.)
- **Docker Compose**: One command to start everything

## Architecture

```
┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────┐  ┌───────┐
│ Frontend │  │ Backend  │  │Postgres│  │ MinIO │  │ Redis │
│ React+   │→ │ FastAPI  │→ │        │  │  (S3) │  │       │
│ Konva    │  │          │  │        │  │       │  │       │
│ :3000    │  │ :8010    │  │ :5432  │  │ :9002 │  │ :6380 │
└──────────┘  └────┬─────┘  └────────┘  └───────┘  └───────┘
                   │ Unified Model API
          ┌────────┴────────┐
          ▼                 ▼
   ┌────────────┐   ┌─────────────┐
   │ YOLO       │   │ Qwen3-VL    │
   │ Adapter    │   │ Adapter →   │
   │ :8001      │   │ Qwen API    │
   └────────────┘   └─────────────┘
```

## Quick Start

```bash
# Start core services
docker compose up -d

# Default login: admin@mlabled.local / admin
# Open: http://localhost:3000
```

## Adding Models

### YOLO (fixed-class detection)

```bash
docker build -t mlabled-yolo -f model_template/examples/yolo/Dockerfile model_template
docker run -d --name mlabled-yolo --network mlabled_default -p 8001:8000 \
  --gpus 1 mlabled-yolo
```

### Qwen3-VL (open-vocabulary detection)

Requires a separate [qwen3-vl-inference](https://github.com/rpol-recart/qwen3-vl-inference) server:

```bash
# 1. Start Qwen3-VL API server (separate repo, needs GPU)
cd /path/to/qwen3-vl-inference
HOST_PORT=8501 docker compose up -d

# 2. Start the adapter that bridges Qwen API to MLabled's unified API
docker build -t mlabled-qwen-adapter -f model_template/examples/qwen_vl/Dockerfile model_template
docker run -d --name mlabled-qwen-adapter --network mlabled_default -p 8002:8000 \
  --add-host=host.docker.internal:host-gateway mlabled-qwen-adapter
```

Then register models in the UI: **Models → Register Model** → enter adapter URL.

### Custom Models

Implement the `BaseMLModel` interface in `model_template/base/base_model.py`:

```python
class MyAdapter(BaseMLModel):
    def load(self, config): ...
    def predict(self, image: bytes, params: dict) -> list[Prediction]: ...
    def info(self) -> ModelInfo: ...
```

See `model_template/examples/` for reference.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| N | Toggle draw mode (last tool ↔ select) |
| V | Select tool |
| B | BBox tool |
| P | Polygon tool |
| K | Points tool |
| R | Brush tool |
| S | SAM tool |
| D / F | Previous / Next image |
| ← / → | Previous / Next annotated image |
| Ctrl+S | Save |
| Ctrl+Z | Undo |
| Del | Delete selected annotation |
| Esc | Deselect |
| H | Toggle visibility of selected |
| Space+drag | Pan canvas |
| Scroll | Zoom |
| 1-9 | Select label by number |

## Export & MinIO Sync

- **Export dialog**: Projects → Export → choose format, scope, include images
- **Sync to MinIO**: Per-task sync writes annotations alongside images:

```
{bucket}/{project}/{task}/
├── images/
├── annotations/
│   ├── CVAT/
│   │   └── annotations.xml
│   └── YOLO/
│       ├── labels/
│       └── classes.txt
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18, TypeScript, Vite, Konva, Zustand |
| Backend | FastAPI, SQLAlchemy, Alembic, Celery |
| Database | PostgreSQL 16 |
| Storage | MinIO (S3-compatible) |
| Cache | Redis 7 |
| Models | Unified API template (FastAPI per model) |
