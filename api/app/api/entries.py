from fastapi import APIRouter, HTTPException, Response, status

from app.api import convert, schemas
from app.api.deps import SessionDep
from app.models import Food
from app.services import entries
from app.services.entries import NotFound

router = APIRouter(tags=["entries"])

NOT_FOUND = {404: {"description": "unknown food or entry"}}


@router.post("/entries", status_code=status.HTTP_201_CREATED, responses=NOT_FOUND)
def create_entry(body: schemas.EntryCreate, session: SessionDep) -> schemas.Entry:
    """Log a food. Without grams the standard serving applies, without meal the suggestion."""
    try:
        entry = entries.create_entry(
            session, body.food_id, grams=body.grams, meal=body.meal, eaten_at=body.eaten_at
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
