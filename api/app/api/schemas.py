"""Request and response models; they make up the OpenAPI schema for later clients (SPEC 5)."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.domain.meal import Meal
from app.labels.draft import LabelDraft
from app.labels.validation import Rule

Source = Literal["own", "bls", "off"]
Basis = Literal["g", "ml"]
Origin = Literal["package", "estimated", "own"]
Amount = Annotated[float, Field(ge=0)]


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
    image_path: str | None = Field(description="file name, served at /api/v1/images/{name}")
    per_100: Nutrients
    servings: list[Serving]
    standard_serving: StandardServing


class BarcodeServing(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: str
    grams: float
    origin: Origin
    is_default: bool


class BarcodeFood(BaseModel):
    """A scanned product: a stored food (id set) or a draft from Open Food Facts (id null)."""

    id: int | None = Field(
        description="null: a draft, stored as food on its first entry (POST /entries with gtin)"
    )
    gtin: str = Field(description="GTIN-14")
    name: str
    brand: str | None
    source: Source
    basis: Basis
    density: float
    image_path: str | None = Field(description="file name, served at /api/v1/images/{name}")
    per_100: Nutrients
    servings: list[BarcodeServing]
    standard_serving: StandardServing


class BarcodeNotFound(BaseModel):
    detail: str
    gtin: str = Field(description="the normalised GTIN-14; the client offers the label photo")


class NutrientsIn(BaseModel):
    """Values per 100 g or 100 ml as the editor sends them."""

    kcal: Amount
    protein: Amount
    carbs: Amount
    fat: Amount
    fiber: Amount | None = None
    sugar: Amount | None = None
    sat_fat: Amount | None = None
    salt: Amount | None = None


class NutrientsPatch(BaseModel):
    """Only the values sent change; the optional ones may be set to null."""

    kcal: Amount = None
    protein: Amount = None
    carbs: Amount = None
    fat: Amount = None
    fiber: Amount | None = None
    sugar: Amount | None = None
    sat_fat: Amount | None = None
    salt: Amount | None = None


class ServingIn(BaseModel):
    id: int | None = Field(default=None, description="an existing serving; without id it is new")
    label: str = Field(min_length=1)
    grams: float = Field(gt=0)
    is_default: bool = Field(
        default=False, description="at most one; without any the first is the standard serving"
    )


class ServingAsRead(BaseModel):
    label: str = Field(min_length=1)
    grams: float = Field(gt=0)


class NewServingIn(ServingIn):
    """A serving of a new food; it may keep the origin it was read with from a label."""

    origin: Origin = Field(default="own", description="package or estimated as on the label")
    as_read: ServingAsRead | None = Field(
        default=None,
        description="label and grams as read; when they differ the serving becomes own",
    )


class FoodCreate(BaseModel):
    name: str = Field(min_length=1)
    brand: str | None = None
    basis: Basis = "g"
    density: float = Field(default=1.0, gt=0)
    gtin: str | None = Field(
        default=None,
        description="a scanned code, stored as GTIN-14; 409 when another food has it",
    )
    per_100: NutrientsIn
    servings: list[NewServingIn] = Field(
        default=[], description="origin own unless sent; a PATCH cannot set it"
    )


class FoodUpdate(BaseModel):
    """Only the fields sent change. servings, when sent, is the complete new list."""

    name: str = Field(default=None, min_length=1)
    brand: str | None = None
    basis: Basis = None
    density: float = Field(default=None, gt=0)
    per_100: NutrientsPatch | None = None
    servings: list[ServingIn] | None = Field(
        default=None,
        description="servings left out are removed; a changed package or estimated one becomes own",
    )


class AtwaterIn(BaseModel):
    kcal: Amount
    protein: Amount
    carbs: Amount
    fat: Amount
    fiber: Amount | None = Field(default=None, description="missing counts as 0")


class AtwaterResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    computed_kcal: float = Field(description="4·carbs + 4·protein + 9·fat + 2·fiber")
    deviation_pct: float | None = Field(
        description="|computed - kcal| / kcal in %; null when kcal is 0 and computed is not"
    )
    ok: bool = Field(description="deviation at most 10 %")


class Validation(BaseModel):
    atwater: AtwaterResult


class LabelFoodDraft(LabelDraft):
    """The draft read from the label; the editor fills its fields with it (SPEC 7)."""

    gtin: str | None = Field(
        description="GTIN-14 from the request, never read from the photo; null without one"
    )


class LabelViolation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rule: Rule
    detail: str


class LabelValidation(BaseModel):
    ok: bool = Field(description="no rule violated")
    atwater: AtwaterResult
    violations: list[LabelViolation] = Field(
        description="atwater within 10 %, energy kJ ≈ kcal · 4.184 within 5 %, "
        "sugar ≤ carbs, saturated_fat ≤ fat"
    )


class LabelExtraction(BaseModel):
    draft: LabelFoodDraft
    validation: LabelValidation = Field(description="of the returned draft; the editor warns")
    model: str = Field(description="the model whose draft is returned")
    attempts: int = Field(description="1, or 2 after a violation in the fast model's draft")


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
    """Exactly one of food_id and gtin."""

    food_id: int | None = None
    gtin: str | None = Field(
        default=None,
        description="a scanned code; a cached Open Food Facts product is stored as food first",
    )
    grams: float | None = Field(
        default=None, gt=0, description="default: the food's standard serving, else 100 g"
    )
    meal: Meal | None = Field(default=None, description="default: suggested by eaten_at")
    eaten_at: AwareDatetime | None = Field(default=None, description="default: now")

    @model_validator(mode="after")
    def _one_food(self) -> "EntryCreate":
        if (self.food_id is None) == (self.gtin is None):
            raise ValueError("give exactly one of food_id and gtin")
        return self


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


class GoalIn(BaseModel):
    kcal: float = Field(gt=0)
    protein: Amount
    carbs: Amount
    fat: Amount


class Goal(Macros):
    kind: Literal["day", "default"] = Field(
        description="day: a goal set for this day; default: the default goal applies"
    )
