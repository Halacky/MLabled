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
    image_bytes = await storage.download(image.s3_key, bucket=image.s3_bucket)
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


class FewShotRequest(InferenceRequest):
    """Few-shot: send reference annotations + target image."""
    reference_image_ids: list[int] = []  # images with existing annotations to use as examples


@router.post("/fewshot")
async def fewshot_predict(
    body: FewShotRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Few-shot detection: extract reference embeddings from annotated images,
    then find similar patches on the target image."""
    from app.models.annotation import Annotation

    # Get model server
    result = await db.execute(select(ModelServer).where(ModelServer.id == body.model_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Model not found")

    # Get target image
    result = await db.execute(select(Image).where(Image.id == body.image_id))
    target_image = result.scalar_one_or_none()
    if not target_image:
        raise HTTPException(status_code=404, detail="Target image not found")

    target_bytes = await storage.download(target_image.s3_key, bucket=target_image.s3_bucket)
    target_b64 = base64.b64encode(target_bytes).decode()

    # Build references from annotated images
    references = []
    for ref_img_id in body.reference_image_ids:
        ref_result = await db.execute(select(Image).where(Image.id == ref_img_id))
        ref_img = ref_result.scalar_one_or_none()
        if not ref_img:
            continue

        ref_bytes = await storage.download(ref_img.s3_key, bucket=ref_img.s3_bucket)
        ref_b64 = base64.b64encode(ref_bytes).decode()

        # Get annotations for this reference image
        anns_result = await db.execute(
            select(Annotation).where(Annotation.image_id == ref_img_id)
        )
        for ann in anns_result.scalars().all():
            if ann.type != "bbox":
                continue
            data = ann.data
            references.append({
                "label": ann.label,
                "crop": {"x": data["x"], "y": data["y"], "w": data["width"], "h": data["height"]},
                "image_base64": ref_b64,
            })

    if not references:
        raise HTTPException(status_code=400, detail="No bbox annotations found in reference images")

    # Call model with references
    params = {**body.params, "references": references}
    try:
        result = await model_proxy.predict(server, target_b64, params)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Few-shot inference failed: {e}")

    return result
