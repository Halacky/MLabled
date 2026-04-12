from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole
from app.models.project import TaskType
from app.models.task import TaskStatus
from app.models.annotation import AnnotationType, AnnotationSource
from app.models.model_server import ModelServerStatus


# ── Auth ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: UserRole = UserRole.annotator


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Projects ─────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    task_type: TaskType
    labels: list[str]


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    task_type: TaskType
    labels: list | dict
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Tasks ────────────────────────────────────────────────

class TaskCreate(BaseModel):
    name: str
    assignee_id: int | None = None
    reviewer_id: int | None = None


class TaskUpdate(BaseModel):
    name: str | None = None
    status: TaskStatus | None = None
    assignee_id: int | None = None
    reviewer_id: int | None = None


class TaskResponse(BaseModel):
    id: int
    name: str
    project_id: int
    assignee_id: int | None
    reviewer_id: int | None
    status: TaskStatus
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Images ───────────────────────────────────────────────

class ImageResponse(BaseModel):
    id: int
    task_id: int
    filename: str
    width: int
    height: int
    order_index: int
    s3_bucket: str
    s3_key: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Annotations ──────────────────────────────────────────

class AnnotationCreate(BaseModel):
    label: str
    type: AnnotationType
    data: dict
    source: AnnotationSource = AnnotationSource.manual
    model_name: str | None = None
    confidence: float | None = None


class AnnotationUpdate(BaseModel):
    label: str | None = None
    data: dict | None = None


class AnnotationResponse(BaseModel):
    id: int
    image_id: int
    created_by: int
    label: str
    type: AnnotationType
    data: dict
    source: AnnotationSource
    model_name: str | None
    confidence: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Model Servers ────────────────────────────────────────

class ModelServerRegister(BaseModel):
    name: str
    url: str


class ModelServerResponse(BaseModel):
    id: int
    name: str
    url: str
    supported_tasks: list[str]
    class_type: str
    labels: list[str]
    capabilities: dict
    status: ModelServerStatus
    config: dict
    last_health_check: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Inference ────────────────────────────────────────────

class InferenceRequest(BaseModel):
    model_id: int
    image_id: int
    params: dict = {}


class BatchInferenceRequest(BaseModel):
    model_id: int
    task_id: int
    params: dict = {}


# ── Review ───────────────────────────────────────────────

class ReviewRequest(BaseModel):
    action: str  # approve / reject
    comment: str | None = None


class ReviewResponse(BaseModel):
    id: int
    task_id: int
    reviewer_id: int
    action: str
    comment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Export ───────────────────────────────────────────────

class ExportRequest(BaseModel):
    format: str  # yolo / cvat
