from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_name: str = "MLabled"
    debug: bool = False
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 1440  # 24h

    # Database
    database_url: str = "postgresql+asyncpg://mlabled:mlabled@postgres:5432/mlabled"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # S3 / MinIO
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "mlabled"
    s3_region: str = "us-east-1"

    # MinIO console URL — shown to users in frontend (should be accessible from user's browser)
    minio_console_url: str = "http://localhost:9003"

    # CORS — "*" allows any origin (needed for remote access)
    cors_origins: list[str] = ["*"]

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
