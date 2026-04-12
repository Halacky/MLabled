from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_role
from app.database import get_db
from app.models.user import User, UserRole
from app.models.model_server import ModelServer, ModelServerStatus
from app.services.model_proxy import model_proxy
from app.schemas import ModelServerRegister, ModelServerResponse

router = APIRouter()


@router.get("/", response_model=list[ModelServerResponse])
async def list_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ModelServer).order_by(ModelServer.id))
    return result.scalars().all()


@router.post("/register", response_model=ModelServerResponse)
async def register_model(
    body: ModelServerRegister,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
):
    # Fetch model info from the server
    temp = ModelServer(name=body.name, url=body.url)
    try:
        info = await model_proxy.info(temp)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach model server: {e}")

    server = ModelServer(
        name=info.get("name", body.name),
        url=body.url,
        supported_tasks=info.get("supported_tasks", []),
        class_type=info.get("class_type", "fixed"),
        labels=info.get("labels", []),
        capabilities=info.get("capabilities", {}),
        status=ModelServerStatus.online,
        config=info.get("config", {}),
        last_health_check=datetime.now(timezone.utc),
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server


@router.post("/{model_id}/health", response_model=ModelServerResponse)
async def check_health(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ModelServer).where(ModelServer.id == model_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Model not found")
    try:
        await model_proxy.health(server)
        server.status = ModelServerStatus.online
    except Exception:
        server.status = ModelServerStatus.offline
    server.last_health_check = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(server)
    return server


@router.delete("/{model_id}")
async def remove_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(ModelServer).where(ModelServer.id == model_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.delete(server)
    await db.commit()
    return {"ok": True}
