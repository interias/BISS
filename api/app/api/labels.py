from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app import images
from app.api import schemas
from app.api.deps import LabelExtractorDep
from app.barcode.gtin import InvalidGtin, normalize_gtin
from app.config import get_settings
from app.labels import photo
from app.labels.extract import extract_label
from app.labels.extractor import ExtractionFailed

router = APIRouter(prefix="/labels", tags=["labels"])


@router.post(
    "/extract",
    responses={
        422: {"description": "no readable JPEG, PNG or WebP up to 10 MB, or an invalid GTIN"},
        502: {"description": "the model gave no usable draft"},
    },
)
async def extract(
    file: Annotated[UploadFile, File(description="photo of the nutrition table")],
    extractor: LabelExtractorDep,
    gtin: Annotated[str | None, Form(description="the scanned code, optional")] = None,
) -> schemas.LabelExtraction:
    """Label photo plus optional GTIN → draft with validation; the photo is not stored.

    The fast model reads first; at a rule violation the strong model tries exactly once more.
    """
    try:
        code = normalize_gtin(gtin) if gtin else None
    except InvalidGtin as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    try:
        data = await run_in_threadpool(photo.prepare, await file.read(images.MAX_BYTES + 1))
    except images.InvalidImage as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    settings = get_settings()
    try:
        result = await extract_label(
            extractor, data, settings.llm_model_fast, settings.llm_model_strong
        )
    except ExtractionFailed as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    check = result.check
    return schemas.LabelExtraction(
        draft=schemas.LabelFoodDraft(gtin=code, **result.draft.model_dump()),
        validation=schemas.LabelValidation(
            ok=check.ok,
            atwater=schemas.AtwaterResult.model_validate(check.atwater),
            violations=[schemas.LabelViolation.model_validate(v) for v in check.violations],
        ),
        model=result.model,
        attempts=result.attempts,
    )
