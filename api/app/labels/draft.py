"""The draft a label extraction returns, with the fixed JSON schema for the model (SPEC 7).

The schema has no GTIN: the model never reads it, the backend sets it from the request.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Basis = Literal["g", "ml"]


class _Strict(BaseModel):
    # additionalProperties false in the schema, so the model cannot add fields.
    model_config = ConfigDict(extra="forbid")


class PackageSize(_Strict):
    amount: float
    unit: Basis


class LabelPer100(_Strict):
    basis: Basis = Field(description="g for 'je 100 g', ml for 'je 100 ml'")
    state: Literal["as_sold", "prepared"] = Field(
        description="as_sold: unprepared column ('unzubereitet'); prepared only without it"
    )
    energy_kj: float
    energy_kcal: float
    fat: float
    saturated_fat: float | None
    carbs: float
    sugar: float | None
    fiber: float | None
    protein: float
    salt: float | None


class LabelServing(_Strict):
    label: str = Field(description="as printed, e.g. '1 Portion (30 g)' or '1 Glas'")
    amount: float
    unit: Basis
    source: Literal["package", "estimated"] = Field(
        description="package: printed on the label; estimated: not printed"
    )


class LabelDraft(_Strict):
    name: str
    brand: str | None
    package_size: PackageSize | None
    per_100: LabelPer100
    servings: list[LabelServing]
    confidence: float = Field(description="0 to 1, how sure the reading is")
    notes: str = Field(description="short notes in German on doubts, empty when none")


def json_schema() -> dict[str, Any]:
    """The JSON schema for output_format; every field is required, missing values are null."""
    return LabelDraft.model_json_schema()
