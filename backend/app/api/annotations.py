from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.image import Image
from app.models.annotation import Annotation
from app.schemas import AnnotationCreate, AnnotationUpdate, AnnotationResponse

router = APIRouter()


@router.get("/image/{image_id}", response_model=list[AnnotationResponse])
async def list_annotations(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Annotation).where(Annotation.image_id == image_id).order_by(Annotation.id)
    )
    return result.scalars().all()


@router.post("/image/{image_id}", response_model=AnnotationResponse)
async def create_annotation(
    image_id: int,
    body: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Image).where(Image.id == image_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Image not found")
    ann = Annotation(
        image_id=image_id,
        created_by=current_user.id,
        label=body.label,
        type=body.type,
        data=body.data,
        source=body.source,
        model_name=body.model_name,
        confidence=body.confidence,
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return ann


@router.post("/image/{image_id}/batch", response_model=list[AnnotationResponse])
async def create_annotations_batch(
    image_id: int,
    body: list[AnnotationCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Image).where(Image.id == image_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Image not found")
    created = []
    for item in body:
        ann = Annotation(
            image_id=image_id,
            created_by=current_user.id,
            label=item.label,
            type=item.type,
            data=item.data,
            source=item.source,
            model_name=item.model_name,
            confidence=item.confidence,
        )
        db.add(ann)
        created.append(ann)
    await db.commit()
    for ann in created:
        await db.refresh(ann)
    return created


@router.put("/{annotation_id}", response_model=AnnotationResponse)
async def update_annotation(
    annotation_id: int,
    body: AnnotationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Annotation).where(Annotation.id == annotation_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ann, field, value)
    await db.commit()
    await db.refresh(ann)
    return ann


@router.delete("/{annotation_id}")
async def delete_annotation(
    annotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Annotation).where(Annotation.id == annotation_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    await db.delete(ann)
    await db.commit()
    return {"ok": True}
