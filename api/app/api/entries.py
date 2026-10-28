from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import JSONResponse

from app.api import convert, schemas
from app.api.deps import NowDep, SessionDep
from app.barcode import chain
from app.barcode.gtin import InvalidGtin
from app.models import Food
from app.services import entries
from app.services.entries import NotFound

router = APIRouter(tags=["entries"])

NOT_FOUND = {404: {"description": "unknown food or entry"}}


@router.post(
    "/entries",
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {
            "description": "unknown food_id; for a gtin no food and no cached product, then "
            "the body is a BarcodeNotFound with the normalised gtin"
        },
        422: {"description": "not exactly one of food_id and gtin, or an invalid gtin"},
    },
)
def create_entry(body: schemas.EntryCreate, session: SessionDep, now: NowDep) -> schemas.Entry:
    """Log a food. Without grams the standard serving applies, without meal the suggestion.

    With gtin instead of food_id a product shown from Open Food Facts is stored as food
    with source off on its first entry (SPEC 4).
    """
    try:
        food_id = body.food_id
        if body.gtin is not None:
            food_id = chain.food_for_entry(session, body.gtin, now).id
        entry = entries.create_entry(
            session, food_id, grams=body.grams, meal=body.meal, eaten_at=body.eaten_at
        )
    except InvalidGtin as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except chain.NotFound as error:
        return JSONResponse(
            status_code=404,
            content=schemas.BarcodeNotFound(detail=str(error), gtin=error.gtin).model_dump(),
        )
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return convert.entry(entry, session.get(Food, entry.food_id))


@router.patch("/entries/{entry_id}", responses=NOT_FOUND)
def update_entry(entry_id: int, body: schemas.EntryUpdate, session: SessionDep) -> schemas.Entry:
    """Change amount (new snapshot) or meal (snapshot unchanged)."""
    try:
        entry = entries.update_entry(session, entry_id, grams=body.grams, meal=body.meal)
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return convert.entry(entry, session.get(Food, entry.food_id))


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_entry(entry_id: int, session: SessionDep) -> Response:
    """Remove an entry, also for "Rückgängig"."""
    try:
        entries.delete_entry(session, entry_id)
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/recent")
def recent(session: SessionDep) -> list[schemas.FoodSummary]:
    """Recent chips: the 8 most used foods (entries, recency), with the standard serving."""
    return [convert.food_summary(food, serving) for food, serving in entries.recent_foods(session)]
