from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_role
from app.database import get_db
from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus
from app.models.review import ReviewAction, ReviewActionType
from app.schemas import ReviewRequest, ReviewResponse

router = APIRouter()


@router.post("/tasks/{task_id}", response_model=ReviewResponse)
async def review_task(
    task_id: int,
    body: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.manager, UserRole.reviewer)),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    action = ReviewAction(
        task_id=task_id,
        reviewer_id=current_user.id,
        action=ReviewActionType(body.action),
        comment=body.comment,
    )
    db.add(action)

    task.status = TaskStatus.accepted if body.action == "approve" else TaskStatus.rejected
    await db.commit()
    await db.refresh(action)
    return action
