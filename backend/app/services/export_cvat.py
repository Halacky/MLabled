"""Export annotations to CVAT XML format, optionally bundled with images in a ZIP."""
import io
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.task import Task
from app.models.image import Image
from app.models.annotation import Annotation
from app.services.storage import storage


async def export_cvat(
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

    # Root XML
    root = Element("annotations")
    version = SubElement(root, "version")
    version.text = "1.1"

    meta = SubElement(root, "meta")
    task_el = SubElement(meta, "task")
    name_el = SubElement(task_el, "name")
    name_el.text = project.name
    labels_el = SubElement(task_el, "labels")
    for label in labels:
        lbl = SubElement(labels_el, "label")
        lbl_name = SubElement(lbl, "name")
        lbl_name.text = label

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

    image_data_map: dict[str, bytes] = {}

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
                box.set("occluded", "0")
            elif ann.type == "polygon":
                poly = SubElement(img_el, "polygon")
                poly.set("label", ann.label)
                poly.set("points", ";".join(f"{p[0]:.2f},{p[1]:.2f}" for p in data["points"]))
                poly.set("occluded", "0")
            elif ann.type == "keypoints":
                for pt in data.get("points", []):
                    pts_el = SubElement(img_el, "points")
                    pts_el.set("label", ann.label)
                    pts_el.set("points", f"{pt['x']:.2f},{pt['y']:.2f}")
                    pts_el.set("occluded", "0")

        if include_images:
            image_data_map[img.filename] = await storage.download(img.s3_key, bucket=img.s3_bucket)

    xml_str = '<?xml version="1.0" encoding="utf-8"?>\n' + tostring(root, encoding="unicode")

    if include_images:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("annotations.xml", xml_str)
            for name, data in image_data_map.items():
                zf.writestr(f"images/{name}", data)
        return buf.getvalue()

    return xml_str.encode("utf-8")
