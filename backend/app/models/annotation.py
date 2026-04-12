import enum
from datetime import datetime

from sqlalchemy import String, Enum, Float, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AnnotationType(str, enum.Enum):
    bbox = "bbox"
    polygon = "polygon"
    mask = "mask"
    keypoints = "keypoints"
    classification = "classification"


class AnnotationSource(str, enum.Enum):
    manual = "manual"
    model = "model"


class Annotation(Base):
    __tablename__ = "annotations"

    id: Mapped[int] = mapped_column(primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    label: Mapped[str] = mapped_column(String(255))
    type: Mapped[AnnotationType] = mapped_column(Enum(AnnotationType))
    data: Mapped[dict] = mapped_column(JSONB)
    source: Mapped[AnnotationSource] = mapped_column(
        Enum(AnnotationSource), default=AnnotationSource.manual
    )
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    image = relationship("Image", back_populates="annotations")
    creator = relationship("User", back_populates="annotations")
