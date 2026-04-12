from pydantic import BaseModel


class ModelInfo(BaseModel):
    name: str
    # What task types this model supports
    supported_tasks: list[str] = []  # ["detection", "segmentation", "classification", ...]
    # "fixed" = known class set (YOLO, etc.), "open" = any class (VLMs, CLIP, etc.)
    class_type: str = "fixed"  # "fixed" | "open"
    # For fixed-class models: the full list of classes the model knows
    labels: list[str] = []
    # Freeform capabilities
    capabilities: dict = {}
    config: dict = {}


class PredictRequest(BaseModel):
    image: str  # base64 encoded
    params: dict = {}
    # params can include:
    #   conf: float         — confidence threshold (0-1)
    #   classes: list[str]  — filter to these classes only (for fixed-class models)
    #   prompt: str         — text prompt (for open-class / VLM models)


class Prediction(BaseModel):
    type: str  # bbox | polygon | mask | keypoints | classification
    label: str
    data: dict
    confidence: float = 1.0


class PredictResponse(BaseModel):
    annotations: list[Prediction]


class EmbedRequest(BaseModel):
    image: str  # base64 encoded


class EmbedResponse(BaseModel):
    embedding_id: str


class InteractiveRequest(BaseModel):
    embedding_id: str
    points: list[dict] = []
    boxes: list[dict] = []


class InteractiveResponse(BaseModel):
    mask_rle: str
    score: float
