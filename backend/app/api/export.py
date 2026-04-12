from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.export_yolo import export_yolo
from app.services.export_cvat import export_cvat

router = APIRouter()


class ExportParams(BaseModel):
    format: str  # yolo | cvat
    include_images: bool = False
    task_ids: list[int] | None = None  # None = all tasks in project


@router.post("/projects/{project_id}")
async def export_project(
    project_id: int,
    body: ExportParams,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.format not in ("yolo", "cvat"):
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'yolo' or 'cvat'")

    try:
        if body.format == "yolo":
            data = await export_yolo(project_id, db, task_ids=body.task_ids, include_images=body.include_images)
            return Response(
                content=data,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename=project_{project_id}_yolo.zip"},
            )
        else:
            data = await export_cvat(project_id, db, task_ids=body.task_ids, include_images=body.include_images)
            media = "application/zip" if body.include_images else "application/xml"
            ext = "zip" if body.include_images else "xml"
            return Response(
                content=data,
                media_type=media,
                headers={"Content-Disposition": f"attachment; filename=project_{project_id}_cvat.{ext}"},
            )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/tasks/{task_id}")
async def export_task(
    task_id: int,
    body: ExportParams,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single task."""
    from sqlalchemy import select
    from app.models.task import Task

    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if body.format not in ("yolo", "cvat"):
        raise HTTPException(status_code=400, detail="Unsupported format")

    try:
        if body.format == "yolo":
            data = await export_yolo(task.project_id, db, task_ids=[task_id], include_images=body.include_images)
            return Response(
                content=data,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename=task_{task_id}_yolo.zip"},
            )
        else:
            data = await export_cvat(task.project_id, db, task_ids=[task_id], include_images=body.include_images)
            media = "application/zip" if body.include_images else "application/xml"
            ext = "zip" if body.include_images else "xml"
            return Response(
                content=data,
                media_type=media,
                headers={"Content-Disposition": f"attachment; filename=task_{task_id}_cvat.{ext}"},
            )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
