"""The label photo for the model: in memory only, never written below the images directory."""

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from app.images import ACCEPTED, MAX_BYTES, InvalidImage

# The longer edge; the model scales larger images down anyway, and a phone photo as
# base64 would exceed the request limit for images.
EDGE = 1568
MEDIA_TYPE = "image/jpeg"


def prepare(data: bytes) -> bytes:
    """A JPEG, PNG or WebP (recognised by content) as upright JPEG, longer edge 1568 px."""
    if len(data) > MAX_BYTES:
        raise InvalidImage(f"image larger than {MAX_BYTES // (1024 * 1024)} MB")
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in ACCEPTED:
                raise InvalidImage(f"format {image.format} not accepted, use JPEG, PNG or WebP")
            image.load()
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((EDGE, EDGE), Image.Resampling.LANCZOS)
            out = BytesIO()
            image.save(out, format="JPEG", quality=90)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as error:
        raise InvalidImage(f"not a readable image: {error}") from error
    return out.getvalue()
