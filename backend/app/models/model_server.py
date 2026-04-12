import enum
from datetime import datetime

from sqlalchemy import String, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ModelServerStatus(str, enum.Enum):
    online = "online"
    offline = "offline"
    loading = "loading"


class ModelServer(Base):
    __tablename__ = "model_servers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(512))
    # Tasks this model supports: ["detection", "segmentation", ...]
    supported_tasks: Mapped[list] = mapped_column(JSONB, default=list)
    # "fixed" = known class list, "open" = any class (VLMs, etc.)
    class_type: Mapped[str] = mapped_column(String(50), default="fixed")
    # Full list of class names for fixed-class models
    labels: Mapped[list] = mapped_column(JSONB, default=list)
    capabilities: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[ModelServerStatus] = mapped_column(
        Enum(ModelServerStatus), default=ModelServerStatus.offline
    )
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_health_check: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
