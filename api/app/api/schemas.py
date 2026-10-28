"""Request and response models; they make up the OpenAPI schema for later clients (SPEC 5)."""

from datetime import date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.domain.meal import Meal

Source = Literal["own", "bls", "off"]
Basis = Literal["g", "ml"]
Origin = Literal["package", "estimated", "own"]


class Macros(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kcal: float
    protein: float
    carbs: float
    fat: float


class Nutrients(Macros):
    fiber: float | None
    sugar: float | None
    sat_fat: float | None
    salt: float | None


class StandardServing(BaseModel):
    """The amount a recent chip or an entry without grams uses."""

    model_config = ConfigDict(from_attributes=True)

    label: str
    grams: float
    origin: Origin | None = Field(
        description="null: the food has no standard serving, the derived 100 g applies"
    )


class Serving(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    grams: float
    origin: Origin
    is_default: bool


class FoodSummary(BaseModel):
    """A food in search results and recent chips; values per 100 g or 100 ml (basis)."""

    id: int
    name: str
    brand: str | None
    source: Source
    basis: Basis
    per_100: Macros
    standard_serving: StandardServing


class FoodDetail(BaseModel):
    id: int
    name: str
    brand: str | None
    gtin: str | None
    source: Source
    source_id: str | None
    basis: Basis
    density: float
    image_path: str | None
    per_100: Nutrients
    servings: list[Serving]
    standard_serving: StandardServing


class FoodRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    brand: str | None
    source: Source


class Entry(BaseModel):
    id: int
    food: FoodRef
    grams: float
    meal: Meal
    eaten_at: datetime
    day: date
    macros: Macros = Field(description="snapshot taken when the amount was set")


class EntryCreate(BaseModel):
    food_id: int
    grams: float | None = Field(
        default=None, gt=0, description="default: the food's standard serving, else 100 g"
    )
    meal: Meal | None = Field(default=None, description="default: suggested by eaten_at")
    eaten_at: AwareDatetime | None = Field(default=None, description="default: now")


class EntryUpdate(BaseModel):
    grams: float | None = Field(default=None, gt=0, description="new amount, new snapshot")
    meal: Meal | None = None


class MealEntries(BaseModel):
    meal: Meal
    totals: Macros
    entries: list[Entry]


class Day(BaseModel):
    date: date
    totals: Macros
    targets: Macros
    meals: list[MealEntries] = Field(description="breakfast, lunch, snack, dinner")
    suggested_meal: Meal = Field(description="the meal for an entry made now")
