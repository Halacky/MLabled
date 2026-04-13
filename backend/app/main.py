from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import auth, projects, tasks, images, annotations, models, inference, export, review


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure MinIO bucket exists
    from app.services.storage import storage
    await storage.ensure_bucket()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(annotations.router, prefix="/api/annotations", tags=["annotations"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(inference.router, prefix="/api/inference", tags=["inference"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(review.router, prefix="/api/review", tags=["review"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    """Public config for frontend (MinIO console URL, etc.)."""
    return {
        "minio_console_url": settings.minio_console_url,
        "s3_bucket": settings.s3_bucket,
    }
