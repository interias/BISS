"""Extraction with fallback (SPEC 7a): the fast model first, at a rule violation once the strong.

The rules (ADR-0009) catch a draft that is no plausible plate: no ingredient, an ingredient
without name, an amount of at most 0 g or above MAX_GRAMS, a plate above MAX_PLATE_GRAMS,
a confidence outside 0 to 1.
"""

from dataclasses import dataclass

from app.plates.draft import PlateDraft
from app.plates.extractor import ExtractionFailed, PlateExtractor

# More than a person eats of one food or of one plate; the model misjudged the scale.
MAX_GRAMS = 1500.0
MAX_PLATE_GRAMS = 3000.0


def violations(draft: PlateDraft) -> list[str]:
    """The rules the draft breaks, as short details; empty when it is plausible."""
    found = []
    if not draft.ingredients:
        found.append("no ingredient")
    for item in draft.ingredients:
        name = item.name.strip()
        if not name:
            found.append("ingredient without name")
        label = name or "ingredient"
        if not 0 < item.grams <= MAX_GRAMS:
            found.append(f"{label}: {item.grams:g} g is not within 0 to {MAX_GRAMS:g} g")
        if not 0 <= item.confidence <= 1:
            found.append(f"{label}: confidence {item.confidence:g} is not within 0 to 1")
    total = sum(item.grams for item in draft.ingredients)
    if total > MAX_PLATE_GRAMS:
        found.append(f"plate of {total:g} g is above {MAX_PLATE_GRAMS:g} g")
    return found


@dataclass(frozen=True)
class PlateExtraction:
    draft: PlateDraft
    violations: list[str]
    # The model whose draft is returned, and how many models were asked (1 or 2).
    model: str
    attempts: int


async def extract_plate(
    extractor: PlateExtractor, photo: bytes, fast: str, strong: str
) -> PlateExtraction:
    """Draft of the fast model; with a violation exactly one second try with the strong one.

    If the violation stays, the strong model's draft is returned with its violations. If the
    strong model gives no usable draft, the fast model's draft stays, as for the label.
    """
    draft = await extractor.extract(photo, fast)
    found = violations(draft)
    if not found:
        return PlateExtraction(draft, found, fast, 1)
    try:
        strong_draft = await extractor.extract(photo, strong)
    except ExtractionFailed:
        return PlateExtraction(draft, found, fast, 2)
    return PlateExtraction(strong_draft, violations(strong_draft), strong, 2)
