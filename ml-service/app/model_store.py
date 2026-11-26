"""Persistent model artifact storage for serverless deployments.

Local development keeps artifacts on disk. Set MODEL_MONGODB_URI to store
artifacts in a dedicated MongoDB database (GridFS) when function instances are
ephemeral, as they are on Vercel.
"""

import os
import re
import threading
import time
from pathlib import Path

from gridfs import GridFSBucket
from pymongo import MongoClient

_client = None
_client_lock = threading.Lock()
_sync_lock = threading.Lock()
_synced_at = {}
_SYNC_TTL_SECONDS = 30


def _bucket():
    global _client
    uri = os.getenv("MODEL_MONGODB_URI", "").strip()
    if not uri:
        return None
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = MongoClient(uri, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
    database = _client.get_default_database()
    if database is None:
        raise RuntimeError("MODEL_MONGODB_URI must include a database name.")
    return GridFSBucket(database, bucket_name="wastewise_models")


def restore_outlet(root: Path, outlet_hash: str, force: bool = False) -> None:
    bucket = _bucket()
    if bucket is None:
        return
    now = time.monotonic()
    with _sync_lock:
        if not force and _synced_at.get(outlet_hash, 0) + _SYNC_TTL_SECONDS > now:
            return
        root.mkdir(parents=True, exist_ok=True)
        prefix = f"{outlet_hash}-"
        for record in bucket.find({"filename": {"$regex": f"^{re.escape(prefix)}"}}):
            relative = Path(record.filename)
            if relative.is_absolute() or ".." in relative.parts:
                continue
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            with bucket.open_download_stream(record._id) as source, destination.open("wb") as target:
                while chunk := source.read(1024 * 1024):
                    target.write(chunk)
        _synced_at[outlet_hash] = now


def persist_outlet(root: Path, outlet_hash: str) -> None:
    bucket = _bucket()
    if bucket is None:
        return
    paths = [path for path in root.glob(f"{outlet_hash}-*") if path.is_file()]
    paths.extend(path for directory in root.glob(f"{outlet_hash}-*") if directory.is_dir() for path in directory.rglob("*") if path.is_file())
    for path in paths:
        filename = path.relative_to(root).as_posix()
        for record in bucket.find({"filename": filename}):
            bucket.delete(record._id)
        with path.open("rb") as source:
            bucket.upload_from_stream(filename, source)
    with _sync_lock:
        _synced_at[outlet_hash] = time.monotonic()
