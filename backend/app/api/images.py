from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db, async_session
from app.models.user import User
from app.models.image import Image
from app.services.storage import storage
from app.schemas import ImageResponse

router = APIRouter()


@router.get("/{image_id}", response_model=ImageResponse)
async def get_image(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return image


@router.get("/{image_id}/file")
async def get_image_file(
    image_id: int,
    token: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Serve image file. Accepts JWT via Authorization header OR ?token= query param."""
    # Verify auth: try query param token first (for <img src> usage)
    if token:
        from app.auth import get_current_user as _verify
        from jose import JWTError, jwt as jose_jwt
        from app.config import settings
        try:
            payload = jose_jwt.decode(token, settings.secret_key, algorithms=["HS256"])
            int(payload.get("sub"))
        except (JWTError, TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        # Fall back to header-based auth
        raise HTTPException(status_code=401, detail="Token required. Use ?token=JWT")

    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Stream image bytes directly — avoids presigned URL redirect issues
    data = await storage.download(image.s3_key, bucket=image.s3_bucket)
    content_type = "image/jpeg"
    if image.filename.lower().endswith(".png"):
        content_type = "image/png"
    elif image.filename.lower().endswith(".webp"):
        content_type = "image/webp"
    elif image.filename.lower().endswith(".bmp"):
        content_type = "image/bmp"

    return Response(content=data, media_type=content_type)
