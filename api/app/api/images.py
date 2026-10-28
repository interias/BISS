from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app import images

router = APIRouter(prefix="/images", tags=["images"])

# The name changes with every upload, so a cached image never goes stale.
CACHE_CONTROL = "public, max-age=31536000, immutable"


@router.get(
    "/{name}",
    response_class=FileResponse,
    responses={200: {"content": {"image/webp": {}}}, 404: {"description": "unknown image"}},
)
def get_image(name: str) -> FileResponse:
    """A product image as WebP, cacheable for a year."""
    path = images.path_of(name)
    if path is None:
        raise HTTPException(status_code=404, detail="image not found")
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": CACHE_CONTROL})
