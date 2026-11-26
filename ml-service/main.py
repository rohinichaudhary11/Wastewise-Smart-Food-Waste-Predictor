"""Vercel FastAPI entrypoint."""

import ctypes
import os
from pathlib import Path

# LightGBM's Linux wheel depends on OpenMP. Vercel's Python runtime does not
# provide libgomp, so preload the Amazon Linux 2023 copy bundled with this app.
_libgomp = Path(__file__).resolve().parent / "vendor" / "libgomp.so.1"
if os.name == "posix" and _libgomp.is_file():
    ctypes.CDLL(str(_libgomp), mode=ctypes.RTLD_GLOBAL)

from app.main import app

__all__ = ["app"]
