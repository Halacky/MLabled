"""Export annotations to YOLO format (txt files + classes.txt + optional images)."""
import io
import zipfile

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.task import Task
from app.models.image import Image
from app.models.annotation import Annotation
from app.services.storage import storage


async def export_yolo(
    project_id: int,
    db: AsyncSession,
    task_ids: list[int] | None = None,
    include_images: bool = False,
) -> bytes:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise ValueError("Project not found")

    labels = project.labels if isinstance(project.labels, list) else []

    # Get tasks
    query = select(Task).where(Task.project_id == project_id)
    if task_ids:
        query = query.where(Task.id.in_(task_ids))
    tasks_result = await db.execute(query)
    tasks = tasks_result.scalars().all()
    ids = [t.id for t in tasks]
    if not ids:
        raise ValueError("No tasks found")

    images_result = await db.execute(
        select(Image).where(Image.task_id.in_(ids)).order_by(Image.id)
    )
    images = images_result.scalars().all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("classes.txt", "\n".join(labels))

        for img in images:
            anns_result = await db.execute(
                select(Annotation).where(Annotation.image_id == img.id)
            )
            anns = anns_result.scalars().all()

            lines = []
            for ann in anns:
                if ann.type != "bbox":
                    continue
                data = ann.data
                if ann.label not in labels:
                    continue
                class_id = labels.index(ann.label)
                x, y, w, h = data["x"], data["y"], data["width"], data["height"]
                lines.append(
                    f"{class_id} {(x + w / 2) / img.width:.6f} {(y + h / 2) / img.height:.6f} "
                    f"{w / img.width:.6f} {h / img.height:.6f}"
                )

            name = img.filename.rsplit(".", 1)[0] + ".txt"
            zf.writestr(f"labels/{name}", "\n".join(lines))

            if include_images:
                image_data = await storage.download(img.s3_key, bucket=img.s3_bucket)
                zf.writestr(f"images/{img.filename}", image_data)

        zf.writestr("images.txt", "\n".join(img.filename for img in images))

    return buf.getvalue()
