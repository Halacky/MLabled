import enum
from datetime import datetime

from sqlalchemy import String, Text, Enum, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ReviewActionType(str, enum.Enum):
    approve = "approve"
    reject = "reject"


class ReviewAction(Base):
    __tablename__ = "review_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[ReviewActionType] = mapped_column(Enum(ReviewActionType))
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    task = relationship("Task", back_populates="review_actions")
    reviewer = relationship("User", back_populates="review_actions")
