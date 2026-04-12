from abc import ABC, abstractmethod

from .schema import ModelInfo, Prediction


class BaseMLModel(ABC):
    """Abstract base class that every model adapter must implement."""

    @abstractmethod
    def load(self, config: dict) -> None:
        """Load model weights and prepare for inference."""
        ...

    @abstractmethod
    def predict(self, image: bytes, params: dict) -> list[Prediction]:
        """Run inference on a raw image (bytes).

        params may contain:
            conf (float): confidence threshold
            classes (list[str]): filter predictions to these classes only
            prompt (str): text prompt for open-class models
        """
        ...

    @abstractmethod
    def info(self) -> ModelInfo:
        """Return model metadata including supported_tasks, class_type, labels."""
        ...

    # ── Optional: for interactive segmentation (SAM-like) ──

    def embed(self, image: bytes) -> str:
        raise NotImplementedError("This model does not support embedding")

    def predict_interactive(self, embedding_id: str, points: list[dict], boxes: list[dict]) -> dict:
        raise NotImplementedError("This model does not support interactive prediction")
