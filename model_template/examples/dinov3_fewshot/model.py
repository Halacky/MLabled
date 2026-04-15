"""DINOv3 few-shot similarity adapter.

Flow:
1. User annotates a few examples (patches with labels)
2. DINOv3 extracts embeddings from those patches → stored as reference vectors
3. On new images, extract candidate patches (sliding window or full image)
4. Compare embeddings via cosine similarity
5. Return matches above threshold as predictions

This adapter manages a local embedding store per session.
Uses an external DINOv3 API for feature extraction.

Expected external API:
  POST /extract  {"image_base64": "...", "crops": [{"x","y","w","h"}]} → {"embeddings": [[float, ...]]}
  POST /extract_full {"image_base64": "..."} → {"embedding": [float, ...], "patch_embeddings": [...], "patch_grid": [rows, cols]}
  GET  /health   → {"status": "ready"}
"""
import base64
import io
import math
import numpy as np
import httpx
from PIL import Image

import sys
sys.path.insert(0, "/app")

from base.base_model import BaseMLModel
from base.schema import ModelInfo, Prediction


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a_norm = a / (np.linalg.norm(a) + 1e-8)
    b_norm = b / (np.linalg.norm(b) + 1e-8)
    return float(np.dot(a_norm, b_norm))


class DINOv3FewShotAdapter(BaseMLModel):
    def __init__(self):
        self.api_url = ""
        self.timeout = 60.0
        # Reference embeddings: {label: [np.array, ...]}
        self.references: dict[str, list[np.ndarray]] = {}
        # Patch stride for sliding window detection
        self.patch_sizes = [64, 128, 256]
        self.stride_ratio = 0.5

    def load(self, config: dict) -> None:
        self.api_url = config.get("api_url", "http://localhost:8503").rstrip("/")
        self.timeout = config.get("timeout", 60.0)
        self.patch_sizes = config.get("patch_sizes", [64, 128, 256])
        self.stride_ratio = config.get("stride_ratio", 0.5)
        print(f"[DINOv3] Proxying to: {self.api_url}")

    def info(self) -> ModelInfo:
        labels = list(self.references.keys())
        return ModelInfo(
            name="DINOv3-FewShot",
            supported_tasks=["detection"],
            class_type="open",
            labels=labels,
            capabilities={
                "interactive": False,
                "few_shot": True,
                "accepts_prompt": False,
            },
        )

    def predict(self, image: bytes, params: dict) -> list[Prediction]:
        """
        params:
          - threshold (float): cosine similarity threshold, default 0.7
          - references (list[dict]): optional inline references to register first
              [{"label": "defect", "crop": {"x","y","w","h"}, "image_base64": "..."}]
          - patch_sizes (list[int]): override sliding window sizes
          - nms_iou (float): NMS IoU threshold, default 0.5
        """
        # Register inline references if provided
        refs = params.get("references", [])
        if refs:
            self._register_references(refs)

        if not self.references:
            return []

        threshold = params.get("threshold", 0.7)
        nms_iou = params.get("nms_iou", 0.5)
        patch_sizes = params.get("patch_sizes", self.patch_sizes)

        img = Image.open(io.BytesIO(image))
        w, h = img.size
        image_b64 = base64.b64encode(image).decode()

        # Generate candidate crops via sliding window at multiple scales
        crops = []
        for ps in patch_sizes:
            if ps > min(w, h):
                continue
            stride = max(1, int(ps * self.stride_ratio))
            for cy in range(0, h - ps + 1, stride):
                for cx in range(0, w - ps + 1, stride):
                    crops.append({"x": cx, "y": cy, "w": ps, "h": ps})

        if not crops:
            return []

        # Extract embeddings for all crops in batches
        batch_size = 64
        all_embeddings = []
        for i in range(0, len(crops), batch_size):
            batch = crops[i:i + batch_size]
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(
                    f"{self.api_url}/extract",
                    json={"image_base64": image_b64, "crops": batch},
                )
                resp.raise_for_status()
                embs = resp.json()["embeddings"]
                all_embeddings.extend([np.array(e) for e in embs])

        # Compare each crop embedding against reference embeddings
        raw_preds: list[tuple[str, dict, float]] = []
        for idx, emb in enumerate(all_embeddings):
            best_label = ""
            best_sim = 0.0
            for label, ref_embs in self.references.items():
                for ref in ref_embs:
                    sim = cosine_sim(emb, ref)
                    if sim > best_sim:
                        best_sim = sim
                        best_label = label
            if best_sim >= threshold:
                crop = crops[idx]
                raw_preds.append((best_label, crop, best_sim))

        # NMS per label
        preds = self._nms(raw_preds, nms_iou)

        return [
            Prediction(
                type="bbox",
                label=label,
                data={"x": crop["x"], "y": crop["y"], "width": crop["w"], "height": crop["h"]},
                confidence=round(sim, 4),
            )
            for label, crop, sim in preds
        ]

    def _register_references(self, refs: list[dict]):
        """Extract embeddings from reference crops and store."""
        # Group by image
        by_image: dict[str, list[tuple[str, dict]]] = {}
        for r in refs:
            img_b64 = r.get("image_base64", "")
            label = r.get("label", "object")
            crop = r.get("crop", {})
            if not img_b64 or not crop:
                continue
            by_image.setdefault(img_b64, []).append((label, crop))

        for img_b64, label_crops in by_image.items():
            crops = [lc[1] for lc in label_crops]
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(
                    f"{self.api_url}/extract",
                    json={"image_base64": img_b64, "crops": crops},
                )
                resp.raise_for_status()
                embs = resp.json()["embeddings"]
            for (label, _), emb in zip(label_crops, embs):
                self.references.setdefault(label, []).append(np.array(emb))

    @staticmethod
    def _nms(preds: list[tuple[str, dict, float]], iou_thresh: float) -> list[tuple[str, dict, float]]:
        """Simple NMS: suppress overlapping boxes per label."""
        preds.sort(key=lambda x: x[2], reverse=True)
        keep = []
        for label, crop, sim in preds:
            suppressed = False
            for k_label, k_crop, _ in keep:
                if k_label != label:
                    continue
                if DINOv3FewShotAdapter._iou(crop, k_crop) > iou_thresh:
                    suppressed = True
                    break
            if not suppressed:
                keep.append((label, crop, sim))
        return keep

    @staticmethod
    def _iou(a: dict, b: dict) -> float:
        x1 = max(a["x"], b["x"])
        y1 = max(a["y"], b["y"])
        x2 = min(a["x"] + a["w"], b["x"] + b["w"])
        y2 = min(a["y"] + a["h"], b["y"] + b["h"])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = a["w"] * a["h"]
        area_b = b["w"] * b["h"]
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0
