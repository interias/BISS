from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app import images
from app.api import convert, schemas
from app.api.deps import NowDep, OffDep, SessionDep
from app.barcode import chain
from app.barcode.gtin import InvalidGtin
from app.domain.atwater import atwater
from app.models import Food
from app.search.search import search_foods
from app.services import foods
from app.services.foods import (
    FALLBACK_SERVING,
    GtinTaken,
    InvalidFood,
    NotFound,
    ServingInput,
    StandardServing,
    standard_serving,
)
from app.sources.off import FoodDraft

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


@router.get(
    "/barcode/{code}",
    responses={
        404: {"model": schemas.BarcodeNotFound, "description": "no food and no product"},
        422: {"description": "no EAN-8, UPC-A, EAN-13 or GTIN-14, or a wrong check digit"},
    },
)
def barcode(code: str, session: SessionDep, off: OffDep, now: NowDep) -> schemas.BarcodeFood:
    """Barcode chain: own food, then the Open Food Facts cache, then Open Food Facts live.

    A product from Open Food Facts is a draft (id null) until it is logged with its gtin.
    """
    try:
        found = chain.lookup(session, code, off, now)
    except InvalidGtin as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except chain.NotFound as error:
        return JSONResponse(
            status_code=404,
            content=schemas.BarcodeNotFound(detail=str(error), gtin=error.gtin).model_dump(),
        )
    return _barcode_food(session, found)


@router.post("/validate")
def validate(body: schemas.AtwaterIn) -> schemas.Validation:
    """Atwater check of values per 100 g; the editor shows the result as a hint."""
    result = atwater(body.kcal, body.protein, body.carbs, body.fat, body.fiber)
    return schemas.Validation(atwater=schemas.AtwaterResult.model_validate(result))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "another food has the GTIN"}, 422: {}},
)
def create_food(body: schemas.FoodCreate, session: SessionDep) -> schemas.FoodDetail:
    """Create an own food with its servings; without a marked one the first is standard.

    A gtin makes the food the hit of its barcode (SPEC 6, own DB first).
    """
    fields = body.model_dump(exclude={"gtin", "per_100", "servings"}) | body.per_100.model_dump()
    try:
        food = foods.create_food(session, fields, _new_servings(body.servings), body.gtin)
    except (InvalidFood, InvalidGtin) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except GtinTaken as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
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
    """Servings of a PATCH: the backend alone changes their origin (ADR-0003)."""
    return [ServingInput(s.label, s.grams, s.is_default, s.id) for s in servings]


def _new_servings(servings: list[schemas.NewServingIn]) -> list[ServingInput]:
    return [
        ServingInput(
            s.label,
            s.grams,
            s.is_default,
            s.id,
            s.origin,
            None if s.as_read is None else (s.as_read.label, s.as_read.grams),
        )
        for s in servings
    ]


def _barcode_food(session: Session, found: Food | FoodDraft) -> schemas.BarcodeFood:
    if isinstance(found, Food):
        return schemas.BarcodeFood(
            id=found.id,
            gtin=found.gtin,
            name=found.name,
            brand=found.brand,
            source=found.source,
            basis=found.basis,
            density=found.density,
            image_path=found.image_path,
            per_100=schemas.Nutrients.model_validate(found),
            servings=[
                schemas.BarcodeServing.model_validate(s)
                for s in foods.servings_of(session, found.id)
            ],
            standard_serving=schemas.StandardServing.model_validate(
                standard_serving(session, found.id)
            ),
        )
    serving = found.serving
    return schemas.BarcodeFood(
        id=None,
        gtin=found.gtin,
        name=found.name,
        brand=found.brand,
        source="off",
        basis=found.basis,
        density=1.0,
        image_path=None,
        per_100=schemas.Nutrients(**found.values),
        servings=[]
        if serving is None
        else [schemas.BarcodeServing(**vars(serving), origin="package", is_default=True)],
        standard_serving=schemas.StandardServing.model_validate(
            FALLBACK_SERVING
            if serving is None
            else StandardServing(serving.label, serving.grams, "package")
        ),
    )


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
