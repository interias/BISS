"""The draft a plate extraction returns, with the fixed JSON schema for the model (SPEC 7a)."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# Characters of a dictated sentence (ADR-0013); a meal said aloud is far shorter.
MAX_DICTATION = 600
# Characters of a recipe text or of the page behind a link (ADR-0014).
MAX_RECIPE_SOURCE = 20_000


class _Strict(BaseModel):
    # additionalProperties false in the schema, so the model cannot add fields.
    model_config = ConfigDict(extra="forbid")


class PlateIngredient(_Strict):
    name: str = Field(description="generic German food name as in the BLS, e.g. 'Reis gekocht'")
    grams: float = Field(description="estimated amount on the plate in grams")
    confidence: float = Field(description="0 to 1, how sure the ingredient is recognised")


class PlateDraft(_Strict):
    dish: str = Field(
        description="short German name of the dish, at most about three words, e.g. 'Falafel-Bowl'"
    )
    ingredients: list[PlateIngredient]
    notes: str = Field(description="short notes in German on doubts, empty when none")


def json_schema() -> dict[str, Any]:
    """The JSON schema for output_format; every field is required."""
    return PlateDraft.model_json_schema()


class RecipeIngredient(_Strict):
    name: str = Field(
        description="generic German food name as in the BLS, e.g. 'Weizen Mehl, Type 405'"
    )
    grams: float = Field(description="amount of the whole recipe in grams, raw as weighed in")
    confidence: float = Field(description="0 to 1, how sure name and amount are; below 0.7 guessed")


class RecipeDraft(_Strict):
    """A recipe read from a text or a page (ADR-0014)."""

    name: str = Field(description="short German name of the dish, e.g. 'Skyrbrötchen'")
    portions: int = Field(description="how many portions the recipe makes, 1 when not said")
    ingredients: list[RecipeIngredient]
    description: str = Field(description="the preparation in German, short steps, empty when none")
    notes: str = Field(description="short notes in German on doubts, empty when none")

    def as_plate(self) -> PlateDraft:
        """The ingredients as a plate, for the matching of plates/match.py."""
        return PlateDraft(
            dish=self.name,
            ingredients=[
                PlateIngredient(name=item.name, grams=item.grams, confidence=item.confidence)
                for item in self.ingredients
            ],
            notes=self.notes,
        )


def recipe_json_schema() -> dict[str, Any]:
    return RecipeDraft.model_json_schema()
