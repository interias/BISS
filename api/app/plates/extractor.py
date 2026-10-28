"""The PlateExtractor interface (ADR-0009) and the fake that tests and the e2e stack use."""

from typing import Protocol

from app.labels.extractor import ExtractionFailed
from app.plates.draft import PlateDraft, PlateIngredient

__all__ = ["FAKE_PLATE", "ExtractionFailed", "FakePlateExtractor", "PlateExtractor"]


class PlateExtractor(Protocol):
    async def extract(self, photo: bytes, model: str) -> PlateDraft:
        """Read the plate in a JPEG photo with the given model. Raises ExtractionFailed."""
        ...


# An invented plate. Each name is the name of a BLS food (data/bls), so on the e2e stack,
# which seeds the full BLS, the search matches every ingredient.
FAKE_PLATE = PlateDraft(
    dish="Hähnchen mit Reis und Brokkoli",
    ingredients=[
        PlateIngredient(name="Hähnchen Brustfilet, gegrillt", grams=120, confidence=0.9),
        PlateIngredient(name="Reis gekocht", grams=150, confidence=0.85),
        PlateIngredient(name="Broccoli gekocht", grams=80, confidence=0.6),
    ],
    notes="",
)


class FakePlateExtractor:
    """Deterministic: FAKE_PLATE, or the draft given for a model; records the models asked."""

    def __init__(self, drafts: dict[str, PlateDraft] | None = None) -> None:
        self.drafts = drafts or {}
        self.calls: list[str] = []

    async def extract(self, photo: bytes, model: str) -> PlateDraft:
        self.calls.append(model)
        return self.drafts.get(model, FAKE_PLATE)
