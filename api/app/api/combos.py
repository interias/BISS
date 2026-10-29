from fastapi import APIRouter, HTTPException, Response, status

from app.api import convert, schemas
from app.api.deps import NowDep, SessionDep
from app.services import combos
from app.services.combos import InvalidCombo, NotFound

router = APIRouter(tags=["combos"])

NOT_FOUND = {404: {"description": "unknown combo, food or group"}}


def _items(items: list[schemas.ComboItemIn] | None) -> list[tuple[int, float]] | None:
    return None if items is None else [(item.food_id, item.grams) for item in items]


@router.get("/combos")
def list_combos(session: SessionDep) -> list[schemas.Combo]:
    """Schnellzugriff chips of the dock, by position: items with macros and the sum."""
    return [convert.combo(view) for view in combos.list_combos(session)]


@router.post(
    "/combos",
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "an unknown food_id or group_id; then nothing is stored"},
        422: {"description": "not exactly one of items and group_id, no items or bad grams"},
    },
)
def create_combo(body: schemas.ComboCreate, session: SessionDep) -> schemas.Combo:
    """Save a combo from items or from an entry group of the diary ("als Schnellzugriff merken")."""
    try:
        if body.group_id is not None:
            view = combos.create_from_group(session, body.group_id, body.name)
        else:
            view = combos.create_combo(session, body.name, _items(body.items))
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidCombo as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return convert.combo(view)


@router.patch("/combos/{combo_id}", responses=NOT_FOUND)
def update_combo(combo_id: int, body: schemas.ComboUpdate, session: SessionDep) -> schemas.Combo:
    """Change the name or replace all items ("Als Vorlage speichern")."""
    try:
        view = combos.update_combo(session, combo_id, body.name, _items(body.items))
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidCombo as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return convert.combo(view)


@router.delete("/combos/{combo_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_combo(combo_id: int, session: SessionDep) -> Response:
    """Remove the template; entries logged with it stay."""
    try:
        combos.delete_combo(session, combo_id)
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/combos/{combo_id}/log",
    status_code=status.HTTP_201_CREATED,
    responses={404: {"description": "unknown combo or food; then nothing is logged"}},
)
def log_combo(
    combo_id: int, body: schemas.ComboLog, session: SessionDep, now: NowDep
) -> schemas.EntryGroup:
    """Log the combo as an entry group named like it, as POST /entries/group.

    Without items the template's apply; sent items change this entry, not the template.
    """
    try:
        group = combos.log_combo(
            session,
            combo_id,
            meal=body.meal,
            eaten_at=body.eaten_at or now,
            items=_items(body.items),
        )
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidCombo as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return convert.entry_group(group)
