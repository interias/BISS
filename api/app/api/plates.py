from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app import images
from app.api import convert, schemas
from app.api.deps import PlateExtractorDep, SessionDep
from app.config import get_settings
from app.labels import photo
from app.plates.extract import extract_plate
from app.plates.extractor import ExtractionFailed
from app.plates.match import match_plate

router = APIRouter(prefix="/plates", tags=["plates"])


@router.post(
    "/extract",
    responses={
        422: {"description": "no readable JPEG, PNG or WebP up to 10 MB"},
        502: {
            "description": "the fast model gave no usable draft; when only the strong one "
            "fails, the fast model's draft is returned"
        },
    },
)
async def extract(
    file: Annotated[UploadFile, File(description="photo of the plate")],
    extractor: PlateExtractorDep,
    session: SessionDep,
) -> schemas.PlateExtraction:
    """Plate photo → dish with ingredients matched by the search; the photo is not stored.

    The fast model reads first; at a rule violation the strong model tries exactly once
    more. An ingredient without a food is returned with food_id null and no values.
    Nothing is logged: POST /entries/group does that after the confirmation.
    """
    try:
        data = await run_in_threadpool(photo.prepare, await file.read(images.MAX_BYTES + 1))
    except images.InvalidImage as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    settings = get_settings()
    try:
        result = await extract_plate(
            extractor, data, settings.llm_model_fast, settings.llm_model_strong
        )
    except ExtractionFailed as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    found = await run_in_threadpool(match_plate, session, result.draft)
    return convert.plate(found, result.model, result.attempts)
