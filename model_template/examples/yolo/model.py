import io
from PIL import Image

import sys
sys.path.insert(0, "/app")

from base.base_model import BaseMLModel
from base.schema import ModelInfo, Prediction


class YOLOAdapter(BaseMLModel):
    def load(self, config: dict) -> None:
        from ultralytics import YOLO
        weights = config.get("weights", "yolo11n.pt")
        self.model = YOLO(weights)
        # Build class name list from model
        self.labels = dict(self.model.names)  # {0: "person", 1: "bicycle", ...}
        self.label_names = list(self.labels.values())

    def predict(self, image: bytes, params: dict) -> list[Prediction]:
        img = Image.open(io.BytesIO(image))
        conf = params.get("conf", 0.25)
        iou = params.get("iou", 0.45)

        # Class filtering: convert class names to indices
        filter_classes = params.get("classes", None)  # list of class name strings
        class_indices = None
        if filter_classes:
            name_to_idx = {v: k for k, v in self.labels.items()}
            class_indices = [name_to_idx[c] for c in filter_classes if c in name_to_idx]
            if not class_indices:
                class_indices = None  # no valid classes → don't filter

        results = self.model(
            img,
            conf=conf,
            iou=iou,
            classes=class_indices,
            verbose=False,
        )

        predictions = []
        for result in results:
            if result.boxes is not None:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    cls_id = int(box.cls[0])
                    predictions.append(
                        Prediction(
                            type="bbox",
                            label=self.labels[cls_id],
                            data={
                                "x": round(x1),
                                "y": round(y1),
                                "width": round(x2 - x1),
                                "height": round(y2 - y1),
                            },
                            confidence=round(float(box.conf[0]), 4),
                        )
                    )
        return predictions

    def info(self) -> ModelInfo:
        return ModelInfo(
            name="YOLOv11",
            supported_tasks=["detection"],
            class_type="fixed",
            labels=self.label_names,
            capabilities={
                "interactive": False,
            },
        )
