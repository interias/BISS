"""The LabelExtractor interface (ADR-0004) and the fake that tests and the e2e stack use."""

from typing import Protocol

from app.labels.draft import LabelDraft, LabelPer100, LabelServing, PackageSize


class ExtractionFailed(RuntimeError):
    """The model gave no usable draft (error, timeout, no or invalid structured output)."""


class LabelExtractor(Protocol):
    async def extract(self, photo: bytes, model: str) -> LabelDraft:
        """Read the label in a JPEG photo with the given model. Raises ExtractionFailed."""
        ...


# Invented product with plausible values; it passes every rule of the validation.
FAKE_DRAFT = LabelDraft(
    name="Haferkeks Dinkel",
    brand="Testmühle",
    package_size=PackageSize(amount=200, unit="g"),
    per_100=LabelPer100(
        basis="g",
        state="as_sold",
        energy_kj=1925,
        energy_kcal=460,
        fat=18,
        saturated_fat=7.5,
        carbs=64,
        sugar=22,
        fiber=5,
        protein=8,
        salt=0.6,
    ),
    servings=[LabelServing(label="1 Keks (12,5 g)", amount=12.5, unit="g", source="package")],
    confidence=0.9,
    notes="",
)


class FakeLabelExtractor:
    """Deterministic: FAKE_DRAFT, or the draft given for a model; records the models asked."""

    def __init__(self, drafts: dict[str, LabelDraft] | None = None) -> None:
        self.drafts = drafts or {}
        self.calls: list[str] = []

    async def extract(self, photo: bytes, model: str) -> LabelDraft:
        self.calls.append(model)
        return self.drafts.get(model, FAKE_DRAFT)
