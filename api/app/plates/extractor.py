"""The PlateExtractor interface (ADR-0009) and the fake that tests and the e2e stack use."""

from typing import Protocol

from app.labels.extractor import ExtractionFailed
from app.plates.draft import PlateDraft, PlateIngredient, RecipeDraft, RecipeIngredient
from app.plates.match import Ask

__all__ = ["FAKE_PLATE", "FAKE_RECIPE", "ExtractionFailed", "FakePlateExtractor", "PlateExtractor"]


class PlateExtractor(Protocol):
    async def extract(self, photo: bytes, model: str) -> PlateDraft:
        """Read the plate in a JPEG photo with the given model. Raises ExtractionFailed."""
        ...

    async def dictate(self, text: str, model: str) -> PlateDraft:
        """Read the foods of a dictated sentence with the given model (ADR-0013). Raises
        ExtractionFailed."""
        ...

    async def recipe(self, text: str, model: str) -> RecipeDraft:
        """Read a recipe from a text or a page (ADR-0014). Raises ExtractionFailed."""
        ...

    async def pick(self, asks: list[Ask], model: str) -> list[int | None]:
        """Per ask the index of the candidate that is the ingredient, or None for none.
        Raises ExtractionFailed."""
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


# An invented recipe, its names from the BLS as for FAKE_PLATE. "Zauberpulver" is no food,
# so the e2e test sees an ingredient that stays unmatched.
FAKE_RECIPE = RecipeDraft(
    name="Bananen-Porridge",
    portions=2,
    ingredients=[
        RecipeIngredient(name="Hafer Flocken", grams=100, confidence=0.95),
        RecipeIngredient(name="Vollmilch frisch, 3,5 % Fett", grams=300, confidence=0.9),
        RecipeIngredient(name="Banane roh", grams=120, confidence=0.9),
        RecipeIngredient(name="Zauberpulver", grams=5, confidence=0.4),
    ],
    description="Haferflocken in der Milch aufkochen, Banane hineinschneiden.",
    notes="",
)


class FakePlateExtractor:
    """Deterministic: FAKE_PLATE, or the draft given for a model; records the models asked and
    the sentences dictated."""

    def __init__(
        self,
        drafts: dict[str, PlateDraft] | None = None,
        recipes: dict[str, RecipeDraft] | None = None,
    ) -> None:
        self.drafts = drafts or {}
        self.recipes = recipes or {}
        self.calls: list[str] = []
        self.texts: list[str] = []

    async def extract(self, photo: bytes, model: str) -> PlateDraft:
        self.calls.append(model)
        return self.drafts.get(model, FAKE_PLATE)

    async def dictate(self, text: str, model: str) -> PlateDraft:
        """As for a photo: the sentence does not matter, the plate is the same."""
        self.texts.append(text)
        return await self.extract(b"", model)

    async def recipe(self, text: str, model: str) -> RecipeDraft:
        """FAKE_RECIPE, or the recipe given for a model; the text does not matter."""
        self.calls.append(model)
        self.texts.append(text)
        return self.recipes.get(model, FAKE_RECIPE)

    async def pick(self, asks: list[Ask], model: str) -> list[int | None]:
        """What the search alone would take."""
        return [ask.default for ask in asks]
