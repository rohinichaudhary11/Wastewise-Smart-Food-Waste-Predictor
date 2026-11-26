from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

from app import model_store


class FakeBucket:
    def __init__(self):
        self.files = {}
        self.next_id = 0

    def find(self, query):
        condition = query["filename"]
        if isinstance(condition, dict):
            pattern = condition["$regex"]
            selected = [row for row in self.files.values() if row["filename"].startswith(pattern.removeprefix("^").removesuffix("\\-"))]
        else:
            selected = [row for row in self.files.values() if row["filename"] == condition]
        return [SimpleNamespace(_id=row["_id"], filename=row["filename"]) for row in selected]

    def upload_from_stream(self, filename, stream):
        self.next_id += 1
        self.files[self.next_id] = {"_id": self.next_id, "filename": filename, "data": stream.read()}

    def open_download_stream(self, file_id):
        return BytesIO(self.files[file_id]["data"])

    def delete(self, file_id):
        del self.files[file_id]


def test_model_artifacts_round_trip_between_ephemeral_directories(monkeypatch, tmp_path):
    bucket = FakeBucket()
    monkeypatch.setattr(model_store, "_bucket", lambda: bucket)
    model_store._synced_at.clear()
    outlet_hash = "abc123"
    source = tmp_path / "first"
    (source / f"{outlet_hash}-ww-v1").mkdir(parents=True)
    (source / f"{outlet_hash}-active.json").write_text('{"directory":"abc123-ww-v1"}', encoding="utf-8")
    (source / f"{outlet_hash}-ww-v1" / "manifest.json").write_text('{"model_version":"ww-v1"}', encoding="utf-8")
    (source / f"{outlet_hash}-ww-v1" / "rice.joblib").write_bytes(b"serialized model")

    model_store.persist_outlet(source, outlet_hash)
    restored = tmp_path / "second"
    model_store.restore_outlet(restored, outlet_hash, force=True)

    assert (restored / f"{outlet_hash}-active.json").read_text(encoding="utf-8") == '{"directory":"abc123-ww-v1"}'
    assert (restored / f"{outlet_hash}-ww-v1" / "manifest.json").exists()
    assert (restored / f"{outlet_hash}-ww-v1" / "rice.joblib").read_bytes() == b"serialized model"
