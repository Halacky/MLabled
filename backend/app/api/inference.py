import base64

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db, async_session
from app.models.user import User
from app.models.image import Image
from app.models.model_server import ModelServer
from app.services.storage import storage
from app.services.model_proxy import model_proxy
from app.schemas import InferenceRequest

router = APIRouter()


@router.post("/predict")
async def predict(
    body: InferenceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Get model server
    result = await db.execute(select(ModelServer).where(ModelServer.id == body.model_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Model not found")

    # Get image
    result = await db.execute(select(Image).where(Image.id == body.image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Download image from S3 and encode
    image_bytes = await storage.download(image.s3_key)
    image_b64 = base64.b64encode(image_bytes).decode()

    # Call model
    try:
        result = await model_proxy.predict(server, image_b64, body.params)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Model inference failed: {e}")

    return result


@router.websocket("/ws/interactive/{image_id}")
async def interactive_segmentation(websocket: WebSocket, image_id: int, model_id: int):
    await websocket.accept()

    async with async_session() as db:
        # Get model server
        result = await db.execute(select(ModelServer).where(ModelServer.id == model_id))
        server = result.scalar_one_or_none()
        if not server:
            await websocket.close(code=4004, reason="Model not found")
            return

        # Get image and compute embedding
        result = await db.execute(select(Image).where(Image.id == image_id))
        image = result.scalar_one_or_none()
        if not image:
            await websocket.close(code=4004, reason="Image not found")
            return

        image_bytes = await storage.download(image.s3_key)
        image_b64 = base64.b64encode(image_bytes).decode()

        try:
            embed_result = await model_proxy.embed(server, image_b64)
            embedding_id = embed_result["embedding_id"]
        except Exception as e:
            await websocket.close(code=4002, reason=f"Embedding failed: {e}")
            return

        await websocket.send_json({"type": "ready", "embedding_id": embedding_id})

        # Interactive loop
        try:
            while True:
                data = await websocket.receive_json()
                points = data.get("points", [])
                boxes = data.get("boxes", [])

                result = await model_proxy.predict_interactive(
                    server, embedding_id, points, boxes
                )
                await websocket.send_json({"type": "mask", **result})
        except WebSocketDisconnect:
            pass
