from __future__ import annotations

import logging
from io import BytesIO
from minio import Minio
from minio.error import S3Error
from app.core.config import settings

logger = logging.getLogger("agenthub.storage")

_client: Minio | None = None


def _get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,
        )
        logger.info("MinIO client initialized endpoint=%s", settings.MINIO_ENDPOINT)
    return _client


def _ensure_bucket(bucket: str) -> None:
    client = _get_client()
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
            logger.info("MinIO bucket created: %s", bucket)
    except S3Error:
        logger.exception("MinIO bucket check failed: %s", bucket)
        raise


def upload_file(content: bytes, object_name: str, content_type: str, bucket: str | None = None) -> str:
    bucket = bucket or settings.MINIO_BUCKET
    _ensure_bucket(bucket)
    client = _get_client()
    data = BytesIO(content)
    client.put_object(
        bucket_name=bucket,
        object_name=object_name,
        data=data,
        length=len(content),
        content_type=content_type,
    )
    return object_name


def get_file(object_name: str, bucket: str | None = None) -> bytes:
    bucket = bucket or settings.MINIO_BUCKET
    client = _get_client()
    response = client.get_object(bucket_name=bucket, object_name=object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def get_presigned_url(object_name: str, expires: int = 3600, bucket: str | None = None) -> str:
    bucket = bucket or settings.MINIO_BUCKET
    client = _get_client()
    return client.presigned_get_object(bucket_name=bucket, object_name=object_name, expires=expires)


def delete_file(object_name: str, bucket: str | None = None) -> bool:
    bucket = bucket or settings.MINIO_BUCKET
    client = _get_client()
    try:
        client.remove_object(bucket_name=bucket, object_name=object_name)
        return True
    except S3Error:
        logger.exception("MinIO delete failed: %s/%s", bucket, object_name)
        return False
