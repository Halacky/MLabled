"""SAM3 adapter — proxies to an external SAM API server.

Expected external API contract:
  POST /embed     {"image_base64": "..."} → {"embedding_id": "uuid"}
  POST /predict   {"embedding_id": "...", "points": [...], "boxes": [...]} → {"mask_rle": "...", "score": 0.95}
  GET  /health    → {"status": "ready"}
"""
import base64
import httpx

import sys
sys.path.insert(0, "/app")

from base.base_model import BaseMLModel
from base.schema import ModelInfo, Prediction


class SAMAdapter(BaseMLModel):
    def __init__(self):
        self.api_url = ""
        self.timeout = 120.0

    def load(self, config: dict) -> None:
        self.api_url = config.get("api_url", "http://localhost:8502").rstrip("/")
        self.timeout = config.get("timeout", 120.0)
        print(f"[SAM3] Proxying to: {self.api_url}")

    def predict(self, image: bytes, params: dict) -> list[Prediction]:
        # SAM auto-segment not implemented via proxy — use embed + interactive
        return []

    def info(self) -> ModelInfo:
        return ModelInfo(
            name="SAM3",
            supported_tasks=["segmentation"],
            class_type="open",
            labels=[],
            capabilities={"interactive": True},
        )

    def embed(self, image: bytes) -> str:
        image_b64 = base64.b64encode(image).decode()
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(
                f"{self.api_url}/embed",
                json={"image_base64": image_b64},
            )
            resp.raise_for_status()
            return resp.json()["embedding_id"]

    def predict_interactive(
        self, embedding_id: str, points: list[dict], boxes: list[dict]
    ) -> dict:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{self.api_url}/predict",
                json={
                    "embedding_id": embedding_id,
                    "points": points,
                    "boxes": boxes,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {"mask_rle": data["mask_rle"], "score": data.get("score", 0.95)}
