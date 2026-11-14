from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app import images
from app.api import convert, schemas
from app.api.deps import PlateExtractorDep, SessionDep
from app.config import get_settings
from app.labels import photo
from app.plates.extract import extract_plate, pick_foods
from app.plates.extractor import ExtractionFailed
from app.plates.match import match_plate, plate_asks

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
    more. Each ingredient is matched to a food by the search; where its best hit does not
    carry the name of the ingredient, the model chooses among the candidates or none. An
    ingredient without a food is returned with food_id null and no values.
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
    # Where the search is not sure of the food, the model chooses among its candidates.
    asks = await run_in_threadpool(plate_asks, session, result.draft)
    picked = await pick_foods(extractor, asks, settings.llm_model_fast)
    found = await run_in_threadpool(match_plate, session, result.draft, picked)
    return convert.plate(found, result.model, result.attempts)
