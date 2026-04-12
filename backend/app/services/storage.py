import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import settings


class StorageService:
    def __init__(self):
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=BotoConfig(signature_version="s3v4"),
        )

    def _bucket(self, bucket: str | None = None) -> str:
        return bucket or settings.s3_bucket

    async def ensure_bucket(self, bucket: str | None = None):
        b = self._bucket(bucket)
        try:
            self._client.head_bucket(Bucket=b)
        except ClientError:
            self._client.create_bucket(Bucket=b)

    async def upload(self, key: str, data: bytes, content_type: str = "image/jpeg", bucket: str | None = None):
        b = self._bucket(bucket)
        await self.ensure_bucket(b)
        self._client.put_object(Bucket=b, Key=key, Body=data, ContentType=content_type)

    async def download(self, key: str, bucket: str | None = None) -> bytes:
        b = self._bucket(bucket)
        response = self._client.get_object(Bucket=b, Key=key)
        return response["Body"].read()

    async def delete(self, key: str, bucket: str | None = None):
        b = self._bucket(bucket)
        self._client.delete_object(Bucket=b, Key=key)


storage = StorageService()
