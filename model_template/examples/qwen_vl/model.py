"""Qwen3-VL adapter — proxies to external qwen3-vl-inference API.

Does NOT run the model itself. Calls the separately deployed API:
  - POST /api/v1/grounding/2d      → open-vocabulary detection
  - POST /api/v1/image/description → classification
"""
import io
import re
import base64
import httpx
from PIL import Image

import sys
sys.path.insert(0, "/app")

from base.base_model import BaseMLModel
from base.schema import ModelInfo, Prediction


class QwenVLAdapter(BaseMLModel):
    def __init__(self):
        self.api_url = ""
        self.timeout = 120.0

    def load(self, config: dict) -> None:
        self.api_url = config.get("api_url", "http://localhost:8501").rstrip("/")
        self.timeout = config.get("timeout", 120.0)
        print(f"[QwenVL] Proxying to: {self.api_url}")

    def predict(self, image: bytes, params: dict) -> list[Prediction]:
        task = params.get("task", "detection")
        if task == "classification":
            return self._classify(image, params)
        return self._detect(image, params)

    def _detect(self, image: bytes, params: dict) -> list[Prediction]:
        img = Image.open(io.BytesIO(image))
        w, h = img.size

        classes = params.get("classes", [])
        prompt = params.get("prompt", "")
        detect_prompt = ", ".join(classes) if classes else (prompt or "all objects")

        image_b64 = f"data:image/jpeg;base64,{base64.b64encode(image).decode()}"

        # Build categories list + empty prompt to trigger grounding mode
        cats = classes if classes else [c.strip() for c in prompt.split(",") if c.strip()] if prompt else None
        body: dict = {
            "image_base64": image_b64,
            "prompt": "",
            "include_attributes": True,
            "max_tokens": params.get("max_tokens", 1024),
            "temperature": 0.0,
            "min_pixels": 16384,
            "max_pixels": 262144,
        }
        if cats:
            body["categories"] = cats

        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(f"{self.api_url}/api/v1/grounding/2d", json=body)
            resp.raise_for_status()
            data = resp.json()

        if not data.get("success"):
            return []

        result = data.get("result", "")
        # Result can be a string with <ref><box> tags, or a list of dicts with bbox_2d
        if isinstance(result, str):
            return self._parse_grounding(result, w, h)
        elif isinstance(result, list):
            return self._parse_json_result(result, w, h)
        return []

    def _parse_grounding(self, result: str, w: int, h: int) -> list[Prediction]:
        preds = []
        # <ref>label</ref><box>(x1, y1),(x2, y2)</box>  — coords in 0-1000
        for label, x1, y1, x2, y2 in re.findall(
            r'<ref>(.*?)</ref>\s*<box>\((\d+),\s*(\d+)\),\s*\((\d+),\s*(\d+)\)</box>', result
        ):
            px1 = int(x1) / 1000 * w
            py1 = int(y1) / 1000 * h
            px2 = int(x2) / 1000 * w
            py2 = int(y2) / 1000 * h
            preds.append(Prediction(
                type="bbox", label=label.strip(),
                data={"x": round(px1), "y": round(py1), "width": round(px2 - px1), "height": round(py2 - py1)},
                confidence=0.99,
            ))
        # Also try JSON bbox format: {"bbox_2d": [x1,y1,x2,y2], "label": "..."}
        if not preds:
            try:
                import json
                parsed = json.loads(result) if isinstance(result, str) else result
                if isinstance(parsed, list):
                    return self._parse_json_result(parsed, w, h)
            except (json.JSONDecodeError, TypeError):
                pass
        return preds

    def _parse_json_result(self, items: list, w: int, h: int) -> list[Prediction]:
        """Parse JSON bbox results: [{"bbox_2d": [x1,y1,x2,y2], "label": "..."}]
        Coordinates are in 0-1000 range — must denormalize to pixel coords."""
        preds = []
        for item in items:
            if not isinstance(item, dict):
                continue
            bbox = item.get("bbox_2d") or item.get("bbox") or item.get("box")
            label = item.get("label", "object")
            if bbox and len(bbox) == 4:
                # Denormalize from 0-1000 to pixel coordinates
                x1 = bbox[0] / 1000 * w
                y1 = bbox[1] / 1000 * h
                x2 = bbox[2] / 1000 * w
                y2 = bbox[3] / 1000 * h
                preds.append(Prediction(
                    type="bbox", label=str(label).strip(),
                    data={"x": round(x1), "y": round(y1), "width": round(x2 - x1), "height": round(y2 - y1)},
                    confidence=0.99,
                ))
        return preds

    def _classify(self, image: bytes, params: dict) -> list[Prediction]:
        image_b64 = f"data:image/jpeg;base64,{base64.b64encode(image).decode()}"
        classes = params.get("classes", [])
        prompt = params.get("prompt", "")
        if classes:
            q = f"Classify this image into one of: {', '.join(classes)}. Reply with just the category."
        else:
            q = prompt or "What is the main subject? Reply with a short phrase."

        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(
                f"{self.api_url}/api/v1/image/description",
                json={"image_base64": image_b64, "prompt": q, "detail_level": "basic", "max_tokens": 100, "temperature": 0.0},
            )
            resp.raise_for_status()
            data = resp.json()

        if not data.get("success"):
            return []
        label = data.get("result", "unknown").strip()
        return [Prediction(type="classification", label=label, data={"class": label}, confidence=0.99)]

    def info(self) -> ModelInfo:
        return ModelInfo(
            name="Qwen3-VL",
            supported_tasks=["detection", "classification"],
            class_type="open",
            labels=[],
            capabilities={"interactive": False, "vlm": True, "accepts_prompt": True},
        )
