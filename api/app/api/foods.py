from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app import images
from app.api import convert, schemas
from app.api.deps import SessionDep
from app.domain.atwater import atwater
from app.models import Food
from app.search.search import search_foods
from app.services import foods
from app.services.foods import (
    FALLBACK_SERVING,
    InvalidFood,
    NotFound,
    ServingInput,
    StandardServing,
    standard_serving,
)

router = APIRouter(prefix="/foods", tags=["foods"])

NOT_FOUND = {404: {"description": "unknown food"}}


@router.get("/search")
def search(
    session: SessionDep,
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[schemas.FoodSummary]:
    """Search own foods, BLS and cached products; best match first, duplicates merged."""
    return [
        convert.food_summary(
            hit,
            StandardServing(hit.serving_label, hit.serving_grams, hit.serving_origin)
            if hit.serving_label is not None
            else FALLBACK_SERVING,
        )
        for hit in search_foods(session, q, limit=limit)
    ]


@router.post("/validate")
def validate(body: schemas.AtwaterIn) -> schemas.Validation:
    """Atwater check of values per 100 g; the editor shows the result as a hint."""
    result = atwater(body.kcal, body.protein, body.carbs, body.fat, body.fiber)
    return schemas.Validation(atwater=schemas.AtwaterResult.model_validate(result))


@router.post("", status_code=status.HTTP_201_CREATED, responses={422: {}})
def create_food(body: schemas.FoodCreate, session: SessionDep) -> schemas.FoodDetail:
    """Create an own food with its servings; without a marked one the first is standard."""
    fields = body.model_dump(exclude={"per_100", "servings"}) | body.per_100.model_dump()
    try:
        food = foods.create_food(session, fields, _servings(body.servings))
    except InvalidFood as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _detail(session, food)


@router.get("/{food_id}", responses=NOT_FOUND)
def get_food(food_id: int, session: SessionDep) -> schemas.FoodDetail:
    """A food with its values per 100 g (or 100 ml), its servings and its source."""
    return _detail(session, _food(session, food_id))


@router.patch("/{food_id}", responses=NOT_FOUND)
def update_food(food_id: int, body: schemas.FoodUpdate, session: SessionDep) -> schemas.FoodDetail:
    """Change fields and servings. At a BLS or OFF food changed fields are kept as overlay."""
    fields = body.model_dump(exclude_unset=True, exclude={"per_100", "servings"})
    if body.per_100 is not None:
        fields |= body.per_100.model_dump(exclude_unset=True)
    servings = None if body.servings is None else _servings(body.servings)
    try:
        food = foods.update_food(session, food_id, fields, servings)
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidFood as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _detail(session, food)


@router.put("/{food_id}/image", responses=NOT_FOUND)
def put_image(
    food_id: int, file: Annotated[UploadFile, File()], session: SessionDep
) -> schemas.FoodDetail:
    """Product image as JPEG, PNG or WebP up to 10 MB; stored as WebP, longer edge 512 px."""
    food = _food(session, food_id)
    try:
        name = images.save(food.id, file.file.read(images.MAX_BYTES + 1))
    except images.InvalidImage as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    previous, food.image_path = food.image_path, name
    try:
        session.commit()
    except Exception:
        if name != previous:
            images.delete(name)
        raise
    if previous and previous != name:
        images.delete(previous)
    return _detail(session, food)


def _food(session: Session, food_id: int) -> Food:
    try:
        return foods.get_food(session, food_id)
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


def _servings(servings: list[schemas.ServingIn]) -> list[ServingInput]:
    return [ServingInput(s.label, s.grams, s.is_default, s.id) for s in servings]


def _detail(session: Session, food: Food) -> schemas.FoodDetail:
    return schemas.FoodDetail(
        id=food.id,
        name=food.name,
        brand=food.brand,
        gtin=food.gtin,
        source=food.source,
        source_id=food.source_id,
        basis=food.basis,
        density=food.density,
        image_path=food.image_path,
        per_100=schemas.Nutrients.model_validate(food),
        servings=[schemas.Serving.model_validate(s) for s in foods.servings_of(session, food.id)],
        standard_serving=schemas.StandardServing.model_validate(standard_serving(session, food.id)),
    )
