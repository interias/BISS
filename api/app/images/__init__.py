"""Product images: converted to WebP and kept in the images volume (SPEC 5, 9)."""

import hashlib
import os
import re
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings

MAX_BYTES = 10 * 1024 * 1024
# The longer edge; smaller images keep their size.
EDGE = 512
# Pillow reports camera JPEGs with an MPF block (phones) as MPO.
ACCEPTED = {"JPEG", "MPO", "PNG", "WEBP"}
# <food id>-<content hash>.webp: a new upload gets a new name, so clients may cache forever.
NAME = re.compile(r"^\d+-[0-9a-f]{16}\.webp$")


class InvalidImage(ValueError):
    pass


def images_dir() -> Path:
    return get_settings().images_dir


def to_webp(data: bytes) -> bytes:
    """Convert a JPEG, PNG or WebP (recognised by content) to WebP, longer edge 512 px.

    Pillow's decompression bomb limit stays active.
    """
    if len(data) > MAX_BYTES:
        raise InvalidImage(f"image larger than {MAX_BYTES // (1024 * 1024)} MB")
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in ACCEPTED:
                raise InvalidImage(f"format {image.format} not accepted, use JPEG, PNG or WebP")
            image.load()
            image = ImageOps.exif_transpose(image)
            if image.mode not in ("RGB", "RGBA"):
                alpha = image.mode in ("LA", "PA") or "transparency" in image.info
                image = image.convert("RGBA" if alpha else "RGB")
            image.thumbnail((EDGE, EDGE), Image.Resampling.LANCZOS)
            out = BytesIO()
            image.save(out, format="WEBP", quality=85)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as error:
        raise InvalidImage(f"not a readable image: {error}") from error
    return out.getvalue()


def save(food_id: int, data: bytes) -> str:
    """Convert and store an upload; return the file name below the images directory."""
    webp = to_webp(data)
    name = f"{food_id}-{hashlib.sha256(webp).hexdigest()[:16]}.webp"
    directory = images_dir()
    directory.mkdir(parents=True, exist_ok=True)
    partial = directory / f".{name}.part"
    partial.write_bytes(webp)
    os.replace(partial, directory / name)
    return name


def path_of(name: str) -> Path | None:
    """The stored file for a name, None for an unknown or malformed name."""
    if not NAME.fullmatch(name):
        return None
    path = images_dir() / name
    return path if path.is_file() else None


def delete(name: str) -> None:
    if NAME.fullmatch(name):
        (images_dir() / name).unlink(missing_ok=True)
