from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image as PILImage
import io

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.task import Task
from app.models.image import Image
from app.models.annotation import Annotation
from app.config import settings
from app.services.storage import storage
from app.schemas import TaskUpdate, TaskResponse, ImageResponse

router = APIRouter()


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return task


@router.post("/{task_id}/images", response_model=list[ImageResponse])
async def upload_images(
    task_id: int,
    files: list[UploadFile] = File(...),
    quality: int = 100,
    s3_bucket: str | None = None,
    s3_prefix: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload images to a task.

    - quality: JPEG quality 1-100 (100 = original, <100 = re-encode as JPEG)
    - s3_bucket: custom MinIO bucket (default: mlabled)
    - s3_prefix: custom path prefix inside bucket (default: projects/{name}/{task})
    """
    from app.models.project import Project

    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Resolve project name for default path
    proj_result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = proj_result.scalar_one()

    # Build S3 prefix
    if s3_prefix:
        prefix = s3_prefix.strip("/")
    else:
        prefix = f"projects/{project.name}/{task.name}"

    # Get current max order
    img_result = await db.execute(
        select(Image).where(Image.task_id == task_id).order_by(Image.order_index.desc())
    )
    last = img_result.scalars().first()
    order = (last.order_index + 1) if last else 0

    quality = max(1, min(100, quality))

    created = []
    for f in files:
        raw_data = await f.read()
        img = PILImage.open(io.BytesIO(raw_data))
        w, h = img.size

        # Re-encode if quality < 100
        if quality < 100:
            buf = io.BytesIO()
            rgb = img.convert("RGB") if img.mode != "RGB" else img
            rgb.save(buf, format="JPEG", quality=quality)
            upload_data = buf.getvalue()
            content_type = "image/jpeg"
            filename = f.filename.rsplit(".", 1)[0] + ".jpg" if "." in f.filename else f.filename + ".jpg"
        else:
            upload_data = raw_data
            content_type = f.content_type or "image/jpeg"
            filename = f.filename

        bucket = s3_bucket or settings.s3_bucket
        s3_key = f"{prefix}/images/{filename}"
        await storage.upload(s3_key, upload_data, content_type=content_type, bucket=bucket)

        image = Image(
            task_id=task_id,
            s3_bucket=bucket,
            s3_key=s3_key,
            filename=filename,
            width=w,
            height=h,
            order_index=order,
        )
        db.add(image)
        order += 1
        created.append(image)

    await db.commit()
    for img in created:
        await db.refresh(img)
    return created


@router.get("/{task_id}/images", response_model=list[ImageResponse])
async def list_images(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Image).where(Image.task_id == task_id).order_by(Image.order_index)
    )
    return result.scalars().all()


@router.get("/{task_id}/stats")
async def task_stats(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return image count, annotation count, and first image id for thumbnail."""
    img_count = await db.execute(
        select(func.count(Image.id)).where(Image.task_id == task_id)
    )
    ann_count = await db.execute(
        select(func.count(Annotation.id))
        .join(Image, Annotation.image_id == Image.id)
        .where(Image.task_id == task_id)
    )
    first_img = await db.execute(
        select(Image).where(Image.task_id == task_id).order_by(Image.order_index).limit(1)
    )
    first = first_img.scalar_one_or_none()

    # Derive the task-level prefix from first image's s3_key
    # Images stored as {prefix}/images/{filename} → strip /images/{filename}
    s3_path = None
    s3_bucket_name = None
    if first:
        s3_bucket_name = first.s3_bucket
        key = first.s3_key
        if "/images/" in key:
            s3_path = key.split("/images/")[0]
        else:
            parts = key.rsplit("/", 1)
            s3_path = parts[0] if len(parts) > 1 else ""

    return {
        "image_count": img_count.scalar() or 0,
        "annotation_count": ann_count.scalar() or 0,
        "first_image_id": first.id if first else None,
        "s3_bucket": s3_bucket_name,
        "s3_path": s3_path,
    }


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
    return {"ok": True}


@router.post("/{task_id}/sync-annotations")
async def sync_annotations_to_s3(
    task_id: int,
    format: str = "yolo",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Write annotations to MinIO alongside images.

    For YOLO: writes labels/*.txt + classes.txt into the same bucket/prefix as images.
    For CVAT: writes annotations.xml.
    """
    from app.models.project import Project

    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    proj_result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = proj_result.scalar_one()

    labels = project.labels if isinstance(project.labels, list) else []

    # Get images for this task
    img_result = await db.execute(
        select(Image).where(Image.task_id == task_id).order_by(Image.order_index)
    )
    images = img_result.scalars().all()
    if not images:
        raise HTTPException(status_code=400, detail="No images in task")

    # Determine bucket and task-level prefix from first image's s3_key
    # Images are stored as {prefix}/images/{filename}, so strip /images/{filename}
    first = images[0]
    bucket = first.s3_bucket
    key = first.s3_key
    # Remove /images/filename.jpg → get the task prefix
    if "/images/" in key:
        task_prefix = key.split("/images/")[0]
    else:
        parts = key.rsplit("/", 1)
        task_prefix = parts[0] if len(parts) > 1 else ""

    files_written = 0

    if format == "yolo":
        # annotations/YOLO/classes.txt
        classes_content = "\n".join(labels)
        await storage.upload(
            f"{task_prefix}/annotations/YOLO/classes.txt",
            classes_content.encode(), content_type="text/plain", bucket=bucket,
        )
        files_written += 1

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

            # annotations/YOLO/labels/{image_name}.txt
            txt_name = img.filename.rsplit(".", 1)[0] + ".txt"
            await storage.upload(
                f"{task_prefix}/annotations/YOLO/labels/{txt_name}",
                "\n".join(lines).encode(),
                content_type="text/plain", bucket=bucket,
            )
            files_written += 1

    elif format == "cvat":
        from xml.etree.ElementTree import Element, SubElement, tostring

        root = Element("annotations")
        ver = SubElement(root, "version")
        ver.text = "1.1"

        for idx, img in enumerate(images):
            img_el = SubElement(root, "image")
            img_el.set("id", str(idx))
            img_el.set("name", img.filename)
            img_el.set("width", str(img.width))
            img_el.set("height", str(img.height))

            anns_result = await db.execute(
                select(Annotation).where(Annotation.image_id == img.id)
            )
            for ann in anns_result.scalars().all():
                data = ann.data
                if ann.type == "bbox":
                    box = SubElement(img_el, "box")
                    box.set("label", ann.label)
                    box.set("xtl", str(data["x"]))
                    box.set("ytl", str(data["y"]))
                    box.set("xbr", str(data["x"] + data["width"]))
                    box.set("ybr", str(data["y"] + data["height"]))
                elif ann.type == "polygon":
                    poly = SubElement(img_el, "polygon")
                    poly.set("label", ann.label)
                    poly.set("points", ";".join(f"{p[0]:.2f},{p[1]:.2f}" for p in data["points"]))

        xml_str = '<?xml version="1.0" encoding="utf-8"?>\n' + tostring(root, encoding="unicode")
        # annotations/CVAT/annotations.xml
        await storage.upload(
            f"{task_prefix}/annotations/CVAT/annotations.xml",
            xml_str.encode(),
            content_type="application/xml", bucket=bucket,
        )
        files_written += 1
    else:
        raise HTTPException(status_code=400, detail="Format must be 'yolo' or 'cvat'")

    return {
        "ok": True,
        "format": format,
        "files_written": files_written,
        "bucket": bucket,
        "prefix": task_prefix,
    }
