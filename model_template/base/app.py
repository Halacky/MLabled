"""
Unified FastAPI server that wraps any BaseMLModel implementation.

Usage in a model adapter's main.py:
    from base.app import create_app
    from my_model import MyAdapter
    app = create_app(MyAdapter, config={...})
"""
import base64

from fastapi import FastAPI, HTTPException

from .base_model import BaseMLModel
from .schema import (
    ModelInfo,
    PredictRequest,
    PredictResponse,
    EmbedRequest,
    EmbedResponse,
    InteractiveRequest,
    InteractiveResponse,
)

_model_instance: BaseMLModel | None = None


def create_app(model_cls: type[BaseMLModel], config: dict | None = None) -> FastAPI:
    app = FastAPI(title="MLabled Model Server")

    @app.on_event("startup")
    def startup():
        global _model_instance
        _model_instance = model_cls()
        _model_instance.load(config or {})

    @app.get("/health")
    def health():
        return {"status": "ready"}

    @app.get("/info", response_model=ModelInfo)
    def info():
        return _model_instance.info()

    @app.post("/predict", response_model=PredictResponse)
    def predict(body: PredictRequest):
        image_bytes = base64.b64decode(body.image)
        preds = _model_instance.predict(image_bytes, body.params)
        return PredictResponse(annotations=preds)

    @app.post("/embed", response_model=EmbedResponse)
    def embed(body: EmbedRequest):
        try:
            image_bytes = base64.b64decode(body.image)
            embedding_id = _model_instance.embed(image_bytes)
            return EmbedResponse(embedding_id=embedding_id)
        except NotImplementedError:
            raise HTTPException(status_code=501, detail="Embedding not supported")

    @app.post("/predict_interactive", response_model=InteractiveResponse)
    def predict_interactive(body: InteractiveRequest):
        try:
            result = _model_instance.predict_interactive(
                body.embedding_id, body.points, body.boxes
            )
            return InteractiveResponse(**result)
        except NotImplementedError:
            raise HTTPException(
                status_code=501, detail="Interactive prediction not supported"
            )

    return app
