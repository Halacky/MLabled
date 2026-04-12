"""SAM (Segment Anything Model) adapter for interactive segmentation.

This is a template — replace with actual SAM3 imports when available.
Currently uses SAM2 from Meta as a reference implementation.
"""
import io
import uuid
import numpy as np
from PIL import Image

import sys
sys.path.insert(0, "/app")

from base.base_model import BaseMLModel
from base.schema import ModelInfo, Prediction


def mask_to_rle(mask: np.ndarray) -> str:
    """Encode binary mask to RLE string."""
    pixels = mask.flatten()
    runs = []
    prev = 0
    count = 0
    for p in pixels:
        if p == prev:
            count += 1
        else:
            runs.append(str(count))
            count = 1
            prev = p
    runs.append(str(count))
    return ",".join(runs)


class SAMAdapter(BaseMLModel):
    def __init__(self):
        self._embeddings: dict[str, object] = {}

    def load(self, config: dict) -> None:
        # Placeholder: replace with actual SAM3/SAM2 loading
        # from sam2.build_sam import build_sam2
        # from sam2.sam2_image_predictor import SAM2ImagePredictor
        self.model_type = config.get("model_type", "sam2_hiera_large")
        self.checkpoint = config.get("checkpoint", "sam2_hiera_large.pt")
        self._predictor = None  # Will be SAM2ImagePredictor(...)
        print(f"[SAM] Model loaded: {self.model_type}")
        print("[SAM] NOTE: Replace placeholder with actual SAM import")

    def predict(self, image: bytes, params: dict) -> list[Prediction]:
        # Auto-segment: generate all masks
        # In real implementation, use SamAutomaticMaskGenerator
        return []

    def info(self) -> ModelInfo:
        return ModelInfo(
            name="SAM3",
            type="interactive_seg",
            capabilities={
                "task_types": ["segmentation"],
                "interactive": True,
            },
            labels=[],
        )

    def embed(self, image: bytes) -> str:
        img = Image.open(io.BytesIO(image))
        img_array = np.array(img)

        embedding_id = str(uuid.uuid4())

        # Placeholder: in real implementation:
        # self._predictor.set_image(img_array)
        # Store the predictor state
        self._embeddings[embedding_id] = {
            "image": img_array,
            # "features": self._predictor.get_image_embedding()
        }

        return embedding_id

    def predict_interactive(
        self, embedding_id: str, points: list[dict], boxes: list[dict]
    ) -> dict:
        if embedding_id not in self._embeddings:
            raise ValueError(f"Embedding {embedding_id} not found")

        stored = self._embeddings[embedding_id]
        h, w = stored["image"].shape[:2]

        # Placeholder: generate a dummy mask
        # In real implementation:
        # point_coords = np.array([[p["x"], p["y"]] for p in points])
        # point_labels = np.array([p["label"] for p in points])
        # masks, scores, _ = self._predictor.predict(
        #     point_coords=point_coords, point_labels=point_labels
        # )
        mask = np.zeros((h, w), dtype=np.uint8)
        if points:
            # Simple circle around first point as placeholder
            cx, cy = int(points[0]["x"]), int(points[0]["y"])
            r = 50
            y_grid, x_grid = np.ogrid[:h, :w]
            circle = (x_grid - cx) ** 2 + (y_grid - cy) ** 2 <= r ** 2
            mask[circle] = 1

        return {
            "mask_rle": mask_to_rle(mask),
            "score": 0.95,
        }
