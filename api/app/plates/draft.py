"""The draft a plate extraction returns, with the fixed JSON schema for the model (SPEC 7a)."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    # additionalProperties false in the schema, so the model cannot add fields.
    model_config = ConfigDict(extra="forbid")


class PlateIngredient(_Strict):
    name: str = Field(description="generic German food name as in the BLS, e.g. 'Reis gekocht'")
    grams: float = Field(description="estimated amount on the plate in grams")
    confidence: float = Field(description="0 to 1, how sure the ingredient is recognised")


class PlateDraft(_Strict):
    dish: str = Field(description="short German name of the dish")
    ingredients: list[PlateIngredient]
    notes: str = Field(description="short notes in German on doubts, empty when none")


def json_schema() -> dict[str, Any]:
    """The JSON schema for output_format; every field is required."""
    return PlateDraft.model_json_schema()
